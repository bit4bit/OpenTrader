from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth.models import User
from django.shortcuts import get_object_or_404
import yfinance as yf
import pandas as pd
import math
from datetime import datetime

from .models import Session


def serialize_session(session):
    return {
        'id': session.id,
        'name': session.name,
        'layout': session.layout,
        'created_at': session.created_at.isoformat(),
        'updated_at': session.updated_at.isoformat(),
    }


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
        session = Session.objects.create(user=request.user, name=name, layout=request.data.get('layout') or {})
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
        session.save()
        return Response(serialize_session(session))

    def delete(self, request, pk):
        self.get_session(request, pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TickerSearch(APIView):
    def get(self, request):
        query = request.query_params.get('q', '')
        if not query:
            return Response([])
        
        try:
            # yfinance doesn't have a direct "search" in the same way as the website
            # but we can use the Ticker and info, or the newer Search functionality
            search = yf.Search(query, max_results=10)
            results = []
            for quote in search.quotes:
                results.append({
                    'symbol': quote.get('symbol'),
                    'name': quote.get('shortname') or quote.get('longname'),
                    'type': quote.get('quoteType'),
                    'exchange': quote.get('exchange')
                })
            return Response(results)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

def clean_value(v):
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else v


class TickerHistory(APIView):
    def get(self, request):
        symbol = request.query_params.get('symbol')
        interval = request.query_params.get('interval', '1d')
        period = request.query_params.get('range', '1mo')
        start = request.query_params.get('start')
        end = request.query_params.get('end')
        
        if not symbol:
            return Response({'error': 'Symbol is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            ticker = yf.Ticker(symbol)
            
            if start and end:
                # Convert unix timestamps to datetime
                start_dt = datetime.fromtimestamp(int(start))
                end_dt = datetime.fromtimestamp(int(end))
                df = ticker.history(start=start_dt, end=end_dt, interval=interval, auto_adjust=False)
            else:
                df = ticker.history(period=period, interval=interval, auto_adjust=False)
            
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
                
                # Convert to unix timestamp (seconds)
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
