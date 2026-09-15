from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth.models import User
from django.shortcuts import get_object_or_404
import math
from datetime import datetime, timezone
from .models import Session, CustomIndicator, Folder, UserPreference
from .providers import registry


def serialize_session(session):
    return {
        'id': session.id,
        'name': session.name,
        'layout': session.layout,
        'folder': session.folder_id,
        'created_at': session.created_at.isoformat(),
        'updated_at': session.updated_at.isoformat(),
    }


def serialize_folder(folder):
    return {
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
        return Response({'active_folder': preference.active_folder_id})

    def patch(self, request):
        preference, _ = UserPreference.objects.get_or_create(user=request.user)
        folder, error = validate_folder_id(request, request.data.get('active_folder'))
        if error:
            return error
        preference.active_folder = folder
        preference.save()
        return Response({'active_folder': preference.active_folder_id})


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
