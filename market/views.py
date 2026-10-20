from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth.models import User
from django.shortcuts import get_object_or_404
import copy
import math
import logging
from datetime import datetime, timezone
from .models import Session, CustomIndicator, Folder, UserPreference, Position
from .providers import registry
from .providers import index_membership
from .providers import symbol_info
from .providers import quote as quote_provider
from .providers import earnings as earnings_provider

logger = logging.getLogger(__name__)


def serialize_session(session):
    return {
        'id': session.id,
        'name': session.name,
        'layout': session.layout,
        'notes': session.notes,
        'favorite': session.favorite,
        'portfolio': session.portfolio,
        'folder': session.folder_id,
        'created_at': session.created_at.isoformat(),
        'updated_at': session.updated_at.isoformat(),
    }


def chart_symbol_name(chart):
    """Chart symbol is a {symbol, provider} dict in current layouts, a
    plain string in older ones."""
    field = chart.get('symbol')
    return field.get('symbol') if isinstance(field, dict) else field


def serialize_folder(folder):    return {
        'id': folder.id,
        'name': folder.name,
        'created_at': folder.created_at.isoformat(),
    }


def validate_folder_id(request, folder_id):
    if folder_id is None:
        return None, None
    folder = Folder.objects.filter(pk=folder_id, user=request.user).first()
    if folder is None:
        return None, Response({'error': 'Invalid folder'}, status=status.HTTP_400_BAD_REQUEST)
    return folder, None


class LoginView(APIView):
    def post(self, request):
        username = (request.data.get('username') or '').strip()
        if not username:
            return Response({'error': 'Username is required'}, status=status.HTTP_400_BAD_REQUEST)
        user, created = User.objects.get_or_create(username=username)
        if created:
            Session.objects.create(user=user, name='My Session', layout={})
        token, _ = Token.objects.get_or_create(user=user)
        return Response({'token': token.key, 'username': user.username})


class SessionListCreate(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        sessions = request.user.sessions.all()
        return Response([serialize_session(s) for s in sessions])

    def post(self, request):
        name = (request.data.get('name') or '').strip()
        if not name:
            return Response({'error': 'Name is required'}, status=status.HTTP_400_BAD_REQUEST)
        session = Session(user=request.user, name=name, layout=request.data.get('layout') or {})
        if 'folder' in request.data:
            folder, error = validate_folder_id(request, request.data.get('folder'))
            if error:
                return error
            session.folder = folder
        session.save()
        return Response(serialize_session(session), status=status.HTTP_201_CREATED)


class SessionDetail(APIView):
    permission_classes = [IsAuthenticated]

    def get_session(self, request, pk):
        return get_object_or_404(Session, pk=pk, user=request.user)

    def get(self, request, pk):
        return Response(serialize_session(self.get_session(request, pk)))

    def patch(self, request, pk):
        session = self.get_session(request, pk)
        if 'name' in request.data:
            name = (request.data.get('name') or '').strip()
            if not name:
                return Response({'error': 'Name cannot be empty'}, status=status.HTTP_400_BAD_REQUEST)
            session.name = name
        if 'layout' in request.data:
            session.layout = request.data['layout']
        if 'notes' in request.data:
            session.notes = request.data['notes']
        if 'favorite' in request.data:
            session.favorite = bool(request.data['favorite'])
        if 'portfolio' in request.data:
            session.portfolio = bool(request.data['portfolio'])
        if 'folder' in request.data:
            folder, error = validate_folder_id(request, request.data.get('folder'))
            if error:
                return error
            session.folder = folder
        session.save()
        return Response(serialize_session(session))

    def delete(self, request, pk):
        self.get_session(request, pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SessionClone(APIView):
    """Copy a session's layout (charts, intervals, indicators, drawings)
    into a new session. With `new_symbol`, cloned charts are re-pointed at
    that symbol — restricted to those currently using `from_symbol` when
    given — and the replaced charts' drawings are dropped (their anchors
    reference the replaced symbol's bars). The chart symbol field is a
    {symbol, provider} dict in current layouts and a plain string in
    older ones."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        session = get_object_or_404(Session, pk=pk, user=request.user)
        name = (request.data.get('name') or f'{session.name} (copy)').strip()
        layout = copy.deepcopy(session.layout)
        new_symbol = request.data.get('new_symbol')
        from_symbol = request.data.get('from_symbol')
        if new_symbol:
            try:
                _provider, meta = registry.resolve_provider(new_symbol)
            except (registry.SymbolNotSupported, KeyError) as e:
                return Response(
                    {'error': f'Cannot resolve symbol {new_symbol}: {e}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            charts = layout.get('charts', [])
            current_symbols = sorted({chart_symbol_name(c) for c in charts})
            if from_symbol is None and len(current_symbols) > 1:
                return Response(
                    {'error': f'Charts use multiple symbols {current_symbols}; specify '
                              'from_symbol to re-point only the matching charts'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            for chart in charts:
                current = chart_symbol_name(chart)
                if from_symbol and current != from_symbol:
                    continue
                chart['symbol'] = {'symbol': new_symbol, 'provider': meta['provider']}
                chart['drawings'] = []
        clone = Session(user=request.user, name=name, layout=layout, notes=session.notes)
        if 'folder' in request.data:
            folder, error = validate_folder_id(request, request.data.get('folder'))
            if error:
                return error
            clone.folder = folder
        else:
            clone.folder = session.folder
        clone.save()
        return Response(serialize_session(clone), status=status.HTTP_201_CREATED)


class FolderListCreate(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response([serialize_folder(f) for f in request.user.folders.all()])

    def post(self, request):
        name = (request.data.get('name') or '').strip()
        if not name:
            return Response({'error': 'Name is required'}, status=status.HTTP_400_BAD_REQUEST)
        folder = Folder.objects.create(user=request.user, name=name)
        return Response(serialize_folder(folder), status=status.HTTP_201_CREATED)


class FolderDetail(APIView):
    permission_classes = [IsAuthenticated]

    def get_folder(self, request, pk):
        return get_object_or_404(Folder, pk=pk, user=request.user)

    def patch(self, request, pk):
        folder = self.get_folder(request, pk)
        name = (request.data.get('name') or '').strip()
        if not name:
            return Response({'error': 'Name cannot be empty'}, status=status.HTTP_400_BAD_REQUEST)
        folder.name = name
        folder.save()
        return Response(serialize_folder(folder))

    def delete(self, request, pk):
        self.get_folder(request, pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PreferenceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        preference, _ = UserPreference.objects.get_or_create(user=request.user)
        return Response({
            'active_folder': preference.active_folder_id,
            'note': preference.note,
            'show_session_quotes': preference.show_session_quotes,
        })

    def patch(self, request):
        preference, _ = UserPreference.objects.get_or_create(user=request.user)
        if 'active_folder' in request.data:
            folder, error = validate_folder_id(request, request.data.get('active_folder'))
            if error:
                return error
            preference.active_folder = folder
        if 'note' in request.data:
            preference.note = request.data['note'] or ''
        if 'show_session_quotes' in request.data:
            preference.show_session_quotes = bool(request.data['show_session_quotes'])
        preference.save()
        return Response({
            'active_folder': preference.active_folder_id,
            'note': preference.note,
            'show_session_quotes': preference.show_session_quotes,
        })


def serialize_position(position):
    return {
        'id': position.id,
        'symbol': position.symbol,
        'side': position.side,
        'shares': position.shares,
        'price': position.price,
        'opened_at': position.opened_at.isoformat() if position.opened_at else None,
        'note': position.note,
        'created_at': position.created_at.isoformat(),
    }


def parse_opened_at(value):
    """ISO datetime string from the client; None when absent/invalid."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def serialize_indicator(indicator):
    return {
        'id': indicator.id,
        'name': indicator.name,
        'code': indicator.code,
        'created_at': indicator.created_at.isoformat(),
        'updated_at': indicator.updated_at.isoformat(),
    }


class IndicatorListCreate(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        indicators = request.user.custom_indicators.all()
        return Response([serialize_indicator(i) for i in indicators])

    def post(self, request):
        name = (request.data.get('name') or '').strip()
        if not name:
            return Response({'error': 'Name is required'}, status=status.HTTP_400_BAD_REQUEST)
        code = request.data.get('code') or ''
        indicator = CustomIndicator.objects.create(user=request.user, name=name, code=code)
        return Response(serialize_indicator(indicator), status=status.HTTP_201_CREATED)


class IndicatorDetail(APIView):
    permission_classes = [IsAuthenticated]

    def get_indicator(self, request, pk):
        return get_object_or_404(CustomIndicator, pk=pk, user=request.user)

    def get(self, request, pk):
        return Response(serialize_indicator(self.get_indicator(request, pk)))

    def patch(self, request, pk):
        indicator = self.get_indicator(request, pk)
        if 'name' in request.data:
            name = (request.data.get('name') or '').strip()
            if not name:
                return Response({'error': 'Name cannot be empty'}, status=status.HTTP_400_BAD_REQUEST)
            indicator.name = name
        if 'code' in request.data:
            indicator.code = request.data['code']
        indicator.save()
        return Response(serialize_indicator(indicator))

    def delete(self, request, pk):
        self.get_indicator(request, pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PositionListCreate(APIView):
    """Global per-user tracked positions, rendered as chart markers on any
    chart of the same symbol."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response([serialize_position(p) for p in request.user.positions.all()])

    def post(self, request):
        symbol = (request.data.get('symbol') or '').strip()
        if not symbol:
            return Response({'error': 'Symbol is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            shares = float(request.data.get('shares'))
            price = float(request.data.get('price'))
        except (TypeError, ValueError):
            return Response({'error': 'Shares and price are required numbers'}, status=status.HTTP_400_BAD_REQUEST)
        position = Position.objects.create(
            user=request.user,
            symbol=symbol,
            side='sell' if request.data.get('side') == 'sell' else 'buy',
            shares=shares,
            price=price,
            opened_at=parse_opened_at(request.data.get('opened_at')),
            note=request.data.get('note') or '',
        )
        return Response(serialize_position(position), status=status.HTTP_201_CREATED)


class PositionDetail(APIView):
    permission_classes = [IsAuthenticated]

    def get_position(self, request, pk):
        return get_object_or_404(Position, pk=pk, user=request.user)

    def patch(self, request, pk):
        position = self.get_position(request, pk)
        if 'side' in request.data:
            position.side = 'sell' if request.data['side'] == 'sell' else 'buy'
        try:
            if 'shares' in request.data:
                position.shares = float(request.data['shares'])
            if 'price' in request.data:
                position.price = float(request.data['price'])
        except (TypeError, ValueError):
            return Response({'error': 'Shares and price must be numbers'}, status=status.HTTP_400_BAD_REQUEST)
        if 'opened_at' in request.data:
            position.opened_at = parse_opened_at(request.data['opened_at'])
        if 'note' in request.data:
            position.note = request.data['note'] or ''
        position.save()
        return Response(serialize_position(position))

    def delete(self, request, pk):
        self.get_position(request, pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class IndexMembership(APIView):
    """Benchmark indexes containing a stock, for the Benchmark Index indicator."""
    def get(self, request):
        symbol = request.query_params.get('symbol')
        if not symbol:
            return Response({'error': 'Symbol is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            indexes = index_membership.memberships_for(symbol)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response({'symbol': symbol, 'indexes': indexes})


class SymbolInfo(APIView):
    """Static fundamentals (shares outstanding, market cap) for turnover
    indicators. Provider-specific (Yahoo returns the real values; Kraken
    returns an empty dict because crypto has no share count)."""
    def get(self, request):
        symbol = request.query_params.get('symbol')
        provider_name = request.query_params.get('provider') or None
        if not symbol:
            return Response({'error': 'Symbol is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            provider, _meta = registry.resolve_provider(symbol, provider_name)
        except registry.SymbolNotSupported as e:
            return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
        try:
            info = symbol_info.info_for(symbol, _meta['provider'])
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response({'symbol': symbol, 'provider': _meta['provider'], **info})


class SymbolQuote(APIView):
    """Live-ish quote batch (price, day change, volume change vs the 10-day
    average, 52-week range) for the session manager's quote strips: one
    request for every distinct symbol of the current view, served from a
    short-TTL cache. Unresolvable or crypto symbols degrade to empty
    fields instead of failing the whole batch."""
    def get(self, request):
        symbols = [
            symbol
            for chunk in request.query_params.getlist('symbols')
            for symbol in chunk.split(',')
            if symbol.strip()
        ]
        if not symbols:
            return Response({'error': 'Symbols are required'}, status=status.HTTP_400_BAD_REQUEST)
        response = []
        for symbol in symbols:
            try:
                _provider, _meta = registry.resolve_provider(symbol)
            except registry.SymbolNotSupported:
                provider_name = None
                entry_quote = {}
            else:
                provider_name = _meta['provider']
                try:
                    entry_quote = quote_provider.quote_for(symbol, provider_name)
                except Exception as e:
                    logger.warning('Quote batch entry failed for %s: %s', symbol, e)
                    entry_quote = {}
            response.append({
                'symbol': symbol,
                'provider': provider_name,
                **{field: entry_quote.get(field) for field in quote_provider.QUOTE_FIELDS},
            })
        return Response(response)


class ProviderConfig(APIView):
    """Display config per provider (price decimals), for frontend formatting."""
    def get(self, request):
        return Response({'price_decimals': registry.get_price_decimals()})


class SymbolEarnings(APIView):
    """Quarterly earnings history (report date, EPS estimate/actual,
    surprise) for earnings indicators. Yahoo returns the real reports;
    Kraken returns an empty list because crypto has no earnings."""
    def get(self, request):
        symbol = request.query_params.get('symbol')
        provider_name = request.query_params.get('provider') or None
        if not symbol:
            return Response({'error': 'Symbol is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            provider, _meta = registry.resolve_provider(symbol, provider_name)
        except registry.SymbolNotSupported as e:
            return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
        try:
            earnings = earnings_provider.earnings_for(symbol, _meta['provider'])
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response({'symbol': symbol, 'provider': _meta['provider'], **earnings})


class TickerSearch(APIView):
    def get(self, request):
        query = request.query_params.get('q', '')
        if not query:
            return Response([])
        try:
            return Response(registry.search_all(query))
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ProviderSymbols(APIView):
    def get(self, request):
        provider_name = request.query_params.get('provider')
        try:
            if provider_name:
                names = [provider_name]
            else:
                names = registry.get_configured_provider_names()
            catalogs = []
            for name in names:
                try:
                    catalogs.extend(registry.get_catalog(name))
                except Exception as e:
                    return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            return Response(catalogs)
        except KeyError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


def clean_value(v):
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else v


class TickerHistory(APIView):
    def get(self, request):
        symbol = request.query_params.get('symbol')
        interval = request.query_params.get('interval', '1d')
        period = request.query_params.get('range', '1mo')
        start = request.query_params.get('start')
        end = request.query_params.get('end')
        provider_name = request.query_params.get('provider') or None

        if not symbol:
            return Response({'error': 'Symbol is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            provider, _meta = registry.resolve_provider(symbol, provider_name)
        except registry.SymbolNotSupported as e:
            return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
        except KeyError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            if start and end:
                df = provider.get_history(symbol, interval, start=int(start), end=int(end))
            else:
                df = provider.get_history(symbol, interval, period=period)
            
            if df.empty:
                return Response({'error': 'No data found'}, status=status.HTTP_404_NOT_FOUND)

            # Reset index to get Date/Datetime as a column
            df = df.reset_index()
            
            # Rename columns to match lightweight-charts expectations
            # lightweight-charts uses Unix timestamps (seconds) or YYYY-MM-DD
            data = []
            for _, row in df.iterrows():
                # Handle both Date (DatetimeIndex) and Datetime (DatetimeIndex with time)
                if 'Date' in row:
                    time = row['Date']
                elif 'Datetime' in row:
                    time = row['Datetime']
                else:
                    time = df.iloc[_]['index'] if 'index' in df.columns else None
                
                if time is None: continue

                # Convert to unix timestamp (seconds). For daily-and-longer
                # bars, yfinance stamps midnight in the exchange timezone
                # (e.g. Milan = 22:00 UTC the prior day), which renders as a
                # weekend bar. Use the exchange-local trading DATE at UTC
                # midnight instead — the business-day convention charting
                # libraries expect, and it aligns sessions across exchanges.
                if interval in ('1d', '5d', '1wk', '1mo', '3mo'):
                    timestamp = int(datetime.combine(
                        time.date(), datetime.min.time(), tzinfo=timezone.utc
                    ).timestamp())
                else:
                    timestamp = int(time.timestamp())
                
                row_data = {
                    'time': timestamp,
                    'open': clean_value(row['Open']),
                    'high': clean_value(row['High']),
                    'low': clean_value(row['Low']),
                    'close': clean_value(row['Close']),
                    'volume': clean_value(row['Volume']),
                }
                if row_data['close'] is None and row_data['open'] is None:
                    continue
                data.append(row_data)
            
            return Response(data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
