from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CustomTokenObtainPairView, RegisterView, CurrentUserView, ApplicationViewSet, ExplainView, ClientPresetsView, ClientSearchView, ClientFeaturesView
from rest_framework_simplejwt.views import TokenRefreshView

# Standard DRF Router initialization for automated handling of RESTful viewsets
router = DefaultRouter()
# Automatically registers routes like /applications/ (GET/POST) and /applications/<pk>/ (GET/PUT/DELETE)
router.register(r'applications', ApplicationViewSet, basename='application')

urlpatterns = [
    # Auth endpoints
    path('auth/login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/register/', RegisterView.as_view(), name='register'),
    path('auth/me/', CurrentUserView.as_view(), name='current_user'),
    path('explain/', ExplainView.as_view(), name='explain'),
    path('clients/presets/', ClientPresetsView.as_view(), name='client_presets'),
    path('clients/search/', ClientSearchView.as_view(), name='client_search'),
    path('clients/features/<int:sk_id_curr>/', ClientFeaturesView.as_view(), name='client_features'),
    path('', include(router.urls)), # connects automatically generated routes from the DRF router to the application
]