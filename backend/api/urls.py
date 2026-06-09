from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CustomTokenObtainPairView, RegisterView, CurrentUserView,
    ExperimentViewSet, ExperimentClearView,
    ExplainView, ClientPresetsView, ClientSearchView, ClientFeaturesView,
    MLModelListView, MLModelDetailView, MLModelClearView, CompareModelsView,
)
from rest_framework_simplejwt.views import TokenRefreshView

router = DefaultRouter()
router.register(r'experiments', ExperimentViewSet, basename='experiment')

urlpatterns = [
    path('auth/login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/register/', RegisterView.as_view(), name='register'),
    path('auth/me/', CurrentUserView.as_view(), name='current_user'),
    path('explain/', ExplainView.as_view(), name='explain'),
    path('clients/presets/', ClientPresetsView.as_view(), name='client_presets'),
    path('clients/search/', ClientSearchView.as_view(), name='client_search'),
    path('clients/features/<int:sk_id_curr>/', ClientFeaturesView.as_view(), name='client_features'),
    path('models/', MLModelListView.as_view(), name='ml_models'),
    path('models/clear/', MLModelClearView.as_view(), name='ml_model_clear'),
    path('models/<int:pk>/', MLModelDetailView.as_view(), name='ml_model_detail'),
    path('compare/', CompareModelsView.as_view(), name='compare_models'),
    path('experiments/clear/', ExperimentClearView.as_view(), name='experiment_clear'),
    path('', include(router.urls)),
]