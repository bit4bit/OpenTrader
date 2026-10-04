from django.urls import path
from .views import TickerSearch, TickerHistory, LoginView, SessionListCreate, SessionDetail, ProviderSymbols, ProviderConfig, IndicatorListCreate, IndicatorDetail, FolderListCreate, FolderDetail, PreferenceView, IndexMembership, SymbolInfo

urlpatterns = [
    path('search/', TickerSearch.as_view(), name='ticker-search'),
    path('history/', TickerHistory.as_view(), name='ticker-history'),
    path('index-membership/', IndexMembership.as_view(), name='index-membership'),
    path('symbol/info/', SymbolInfo.as_view(), name='symbol-info'),
    path('symbols/', ProviderSymbols.as_view(), name='provider-symbols'),
    path('providers/config/', ProviderConfig.as_view(), name='provider-config'),
    path('auth/login/', LoginView.as_view(), name='login'),
    path('sessions/', SessionListCreate.as_view(), name='sessions'),
    path('sessions/<int:pk>/', SessionDetail.as_view(), name='session-detail'),
    path('folders/', FolderListCreate.as_view(), name='folders'),
    path('folders/<int:pk>/', FolderDetail.as_view(), name='folder-detail'),
    path('preferences/', PreferenceView.as_view(), name='preferences'),
    path('indicators/', IndicatorListCreate.as_view(), name='indicators'),
    path('indicators/<int:pk>/', IndicatorDetail.as_view(), name='indicator-detail'),
]