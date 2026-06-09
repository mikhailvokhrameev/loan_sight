import pytest


class TestCurrentUserView:
    url = '/api/auth/me/'

    def test_get_current_user(self, auth_client, user):
        response = auth_client.get(self.url)
        assert response.status_code == 200
        assert response.data['email'] == user.email
        assert response.data['first_name'] == user.first_name
        assert response.data['last_name'] == user.last_name
        assert 'id' in response.data

    def test_get_current_user_unauthenticated(self, api_client, db):
        response = api_client.get(self.url)
        assert response.status_code == 401

    def test_update_user_names(self, auth_client, user):
        payload = {'first_name': 'Updated', 'last_name': 'Name'}
        response = auth_client.patch(self.url, payload)
        assert response.status_code == 200
        user.refresh_from_db()
        assert user.first_name == 'Updated'
        assert user.last_name == 'Name'

    def test_email_is_read_only(self, auth_client, user):
        original_email = user.email
        payload = {'email': 'newemail@example.com', 'first_name': 'Test'}
        response = auth_client.patch(self.url, payload)
        assert response.status_code == 200
        user.refresh_from_db()
        assert user.email == original_email

    def test_id_is_read_only(self, auth_client, user):
        original_id = user.id
        payload = {'id': 9999, 'first_name': 'Test'}
        response = auth_client.patch(self.url, payload)
        assert response.status_code == 200
        user.refresh_from_db()
        assert user.id == original_id

    def test_put_update(self, auth_client, user):
        payload = {'first_name': 'Put', 'last_name': 'Updated'}
        response = auth_client.put(self.url, payload)
        assert response.status_code == 200
        user.refresh_from_db()
        assert user.first_name == 'Put'
