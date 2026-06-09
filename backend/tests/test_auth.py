import pytest
from django.urls import reverse
from django.contrib.auth import get_user_model

User = get_user_model()


# Registration
class TestRegisterView:
    url = '/api/auth/register/'

    def test_register_success(self, api_client, db):
        payload = {
            'email': 'new@example.com',
            'password': 'StrongPass123!',
            'password2': 'StrongPass123!',
            'first_name': 'New',
            'last_name': 'User',
        }
        response = api_client.post(self.url, payload)
        assert response.status_code == 201
        assert User.objects.filter(email='new@example.com').exists()

    def test_register_password_mismatch(self, api_client, db):
        payload = {
            'email': 'new@example.com',
            'password': 'StrongPass123!',
            'password2': 'DifferentPass!',
        }
        response = api_client.post(self.url, payload)
        assert response.status_code == 400
        assert 'password' in response.data

    def test_register_duplicate_email(self, api_client, user):
        payload = {
            'email': user.email,
            'password': 'StrongPass123!',
            'password2': 'StrongPass123!',
        }
        response = api_client.post(self.url, payload)
        assert response.status_code == 400

    def test_register_missing_fields(self, api_client, db):
        response = api_client.post(self.url, {'email': 'incomplete@example.com'})
        assert response.status_code == 400

    def test_register_without_names(self, api_client, db):
        payload = {
            'email': 'noname@example.com',
            'password': 'StrongPass123!',
            'password2': 'StrongPass123!',
        }
        response = api_client.post(self.url, payload)
        assert response.status_code == 201
        u = User.objects.get(email='noname@example.com')
        assert u.first_name == ''


# Login
class TestLoginView:
    url = '/api/auth/login/'

    def test_login_success_sets_cookies(self, api_client, user):
        response = api_client.post(self.url, {'email': user.email, 'password': 'StrongPass123!'})
        assert response.status_code == 200
        assert 'access_token' in response.cookies
        assert 'refresh_token' in response.cookies
        assert response.cookies['access_token']['httponly']
        assert response.data == {}

    def test_login_invalid_credentials(self, api_client, user):
        response = api_client.post(self.url, {'email': user.email, 'password': 'WrongPassword!'})
        assert response.status_code == 401

    def test_login_nonexistent_user(self, api_client, db):
        response = api_client.post(self.url, {'email': 'ghost@example.com', 'password': 'pass'})
        assert response.status_code == 401


# Token Refresh
class TestCookieTokenRefreshView:
    url = '/api/auth/refresh/'

    def test_refresh_with_cookie(self, auth_client):
        response = auth_client.post(self.url)
        assert response.status_code == 200
        assert 'access_token' in response.cookies

    def test_refresh_no_cookie(self, api_client, db):
        response = api_client.post(self.url)
        assert response.status_code == 401
        assert 'detail' in response.data

    def test_refresh_invalid_token(self, api_client, db):
        api_client.cookies['refresh_token'] = 'invalid.token.value'
        response = api_client.post(self.url, {'refresh': 'invalid.token.value'})
        assert response.status_code == 401

    def test_refresh_from_body(self, auth_client, user):
        from rest_framework_simplejwt.tokens import RefreshToken
        refresh = RefreshToken.for_user(user)
        client_no_cookies = type(auth_client)()
        response = client_no_cookies.post(self.url, {'refresh': str(refresh)})
        assert response.status_code == 200


# Logout
class TestLogoutView:
    url = '/api/auth/logout/'

    def test_logout_success(self, auth_client):
        response = auth_client.post(self.url)
        assert response.status_code == 204
        # Cookies should be cleared (max_age=0 or empty)
        if 'access_token' in response.cookies:
            assert response.cookies['access_token'].value == '' or response.cookies['access_token']['max-age'] == 0

    def test_logout_unauthenticated(self, api_client, db):
        response = api_client.post(self.url)
        assert response.status_code == 401

    def test_logout_blacklists_refresh_token(self, auth_client):
        from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
        response = auth_client.post(self.url)
        assert response.status_code == 204
        assert BlacklistedToken.objects.exists()

    def test_logout_without_refresh_cookie(self, api_client, user):
        from rest_framework_simplejwt.tokens import RefreshToken
        refresh = RefreshToken.for_user(user)
        api_client.cookies['access_token'] = str(refresh.access_token)
        response = api_client.post(self.url)
        assert response.status_code == 204
