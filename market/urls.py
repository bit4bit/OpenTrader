from django.urls import path
from .views import TickerSearch, TickerHistory, LoginView, SessionListCreate, SessionDetail, ProviderSymbols, IndicatorListCreate, IndicatorDetail

urlpatterns = [
    path('search/', TickerSearch.as_view(), name='ticker-search'),
    path('history/', TickerHistory.as_view(), name='ticker-history'),
    path('symbols/', ProviderSymbols.as_view(), name='provider-symbols'),
    path('auth/login/', LoginView.as_view(), name='login'),
    path('sessions/', SessionListCreate.as_view(), name='sessions'),
    path('sessions/<int:pk>/', SessionDetail.as_view(), name='session-detail'),
    path('indicators/', IndicatorListCreate.as_view(), name='indicators'),
    path('indicators/<int:pk>/', IndicatorDetail.as_view(), name='indicator-detail'),
]