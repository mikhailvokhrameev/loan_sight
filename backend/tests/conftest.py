import os
os.environ.setdefault('SECRET_KEY', 'test-secret-key-for-tests-only-not-for-production-32plus')
os.environ.setdefault('DEBUG', 'True')

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken


User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username='testuser@example.com',
        email='testuser@example.com',
        password='StrongPass123!',
        first_name='Test',
        last_name='User',
    )


@pytest.fixture
def second_user(db):
    return User.objects.create_user(
        username='other@example.com',
        email='other@example.com',
        password='StrongPass123!',
    )


@pytest.fixture
def auth_client(api_client, user):
    """APIClient with JWT access cookie set."""
    refresh = RefreshToken.for_user(user)
    api_client.cookies['access_token'] = str(refresh.access_token)
    api_client.cookies['refresh_token'] = str(refresh)
    return api_client


@pytest.fixture
def ml_model(db):
    from api.models import MLModel
    return MLModel.objects.create(
        name='Test Model',
        model_type='lgbm',
        joblib_path='/tmp/fake_model.joblib',
        feature_names=['EXT_SOURCE_1', 'EXT_SOURCE_2'],
        metrics={'roc_auc': 0.75},
        thresholds={'low': 0.07, 'medium': 0.14},
        is_active=True,
    )


@pytest.fixture
def client_feature(db):
    from api.models import ClientFeature
    client = ClientFeature(sk_id_curr=100001)
    client.amt_income_total = 200000.0
    client.amt_credit = 500000.0
    client.amt_annuity = 25000.0
    client.amt_goods_price = 500000.0
    client.days_birth = 15000.0
    client.days_employed = -3000.0
    client.ext_source_1 = 0.5
    client.ext_source_2 = 0.6
    client.ext_source_3 = 0.4
    client.buro_credit_active_active_mean = 0.3
    client.def_30_cnt_social_circle = 0.0
    client.credit_income_ratio = 2.5
    client.save()
    return client
