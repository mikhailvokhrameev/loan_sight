import pytest
from unittest.mock import patch
from api.models import ClientFeature


PRESETS_URL = '/api/clients/presets/'
SEARCH_URL = '/api/clients/search/'


class TestClientPresetsView:
    def test_presets_empty_db(self, auth_client, db):
        response = auth_client.get(PRESETS_URL)
        assert response.status_code == 200
        assert response.data == []

    def test_presets_unauthenticated(self, api_client, db):
        response = api_client.get(PRESETS_URL)
        assert response.status_code == 401

    def test_presets_returns_matching_clients(self, auth_client, db):
        # Create a client matching 'ideal_borrower': income>200k, days_birth>14600, ext_source_2>0.6
        client = ClientFeature(sk_id_curr=200001)
        client.amt_income_total = 250000.0
        client.days_birth = 15000.0
        client.ext_source_2 = 0.7
        client.save()

        response = auth_client.get(PRESETS_URL)
        assert response.status_code == 200
        ids = [r['id'] for r in response.data]
        assert 'ideal_borrower' in ids

    def test_presets_response_structure(self, auth_client, db):
        client = ClientFeature(sk_id_curr=200002)
        client.amt_income_total = 250000.0
        client.days_birth = 15000.0
        client.ext_source_2 = 0.7
        client.save()

        response = auth_client.get(PRESETS_URL)
        assert response.status_code == 200
        if response.data:
            item = response.data[0]
            assert 'id' in item
            assert 'label' in item
            assert 'description' in item
            assert 'sk_id_curr' in item
            assert 'features' in item


class TestClientSearchView:
    def test_search_no_filters(self, auth_client, client_feature):
        response = auth_client.get(SEARCH_URL)
        assert response.status_code == 200
        assert isinstance(response.data, list)

    def test_search_unauthenticated(self, api_client, db):
        response = api_client.get(SEARCH_URL)
        assert response.status_code == 401

    def test_search_with_income_min(self, auth_client, db):
        low = ClientFeature(sk_id_curr=300001)
        low.amt_income_total = 50000.0
        low.save()

        high = ClientFeature(sk_id_curr=300002)
        high.amt_income_total = 300000.0
        high.save()

        response = auth_client.get(SEARCH_URL, {'income_min': '200000'})
        assert response.status_code == 200
        for item in response.data:
            assert item['amt_income_total'] >= 200000

    def test_search_with_income_max(self, auth_client, db):
        client = ClientFeature(sk_id_curr=300003)
        client.amt_income_total = 80000.0
        client.save()

        response = auth_client.get(SEARCH_URL, {'income_max': '100000'})
        assert response.status_code == 200
        for item in response.data:
            assert item['amt_income_total'] <= 100000

    def test_search_with_age_min(self, auth_client, db):
        client = ClientFeature(sk_id_curr=300004)
        client.days_birth = 20000.0
        client.save()

        response = auth_client.get(SEARCH_URL, {'age_min': '40'})
        assert response.status_code == 200

    def test_search_with_age_max(self, auth_client, db):
        client = ClientFeature(sk_id_curr=300005)
        client.days_birth = 10000.0
        client.save()

        response = auth_client.get(SEARCH_URL, {'age_max': '40'})
        assert response.status_code == 200

    def test_search_had_late_payments_true(self, auth_client, db):
        client = ClientFeature(sk_id_curr=300006)
        client.def_30_cnt_social_circle = 2.0
        client.save()

        response = auth_client.get(SEARCH_URL, {'had_late_payments': 'true'})
        assert response.status_code == 200

    def test_search_invalid_income_filter(self, auth_client, db):
        response = auth_client.get(SEARCH_URL, {'income_min': 'not_a_number'})
        assert response.status_code == 400

    def test_search_invalid_age_filter(self, auth_client, db):
        response = auth_client.get(SEARCH_URL, {'age_min': 'abc'})
        assert response.status_code == 400

    def test_search_result_structure(self, auth_client, client_feature):
        response = auth_client.get(SEARCH_URL)
        assert response.status_code == 200
        if response.data:
            item = response.data[0]
            assert 'sk_id_curr' in item
            assert 'age' in item
            assert 'amt_income_total' in item


class TestClientFeaturesView:
    def test_get_features_success(self, auth_client, client_feature):
        url = f'/api/clients/features/{client_feature.sk_id_curr}/'
        response = auth_client.get(url)
        assert response.status_code == 200
        assert response.data['sk_id_curr'] == client_feature.sk_id_curr
        assert 'numeric_features' in response.data
        assert 'categorical_features' in response.data

    def test_get_features_not_found(self, auth_client, db):
        response = auth_client.get('/api/clients/features/999999/')
        assert response.status_code == 404

    def test_get_features_unauthenticated(self, api_client, client_feature):
        url = f'/api/clients/features/{client_feature.sk_id_curr}/'
        response = api_client.get(url)
        assert response.status_code == 401

    def test_get_features_numeric_fields(self, auth_client, client_feature):
        url = f'/api/clients/features/{client_feature.sk_id_curr}/'
        response = auth_client.get(url)
        assert response.status_code == 200
        numeric = response.data['numeric_features']
        assert 'AMT_INCOME_TOTAL' in numeric
        assert 'AMT_CREDIT' in numeric
        assert 'DAYS_BIRTH' in numeric

    def test_get_features_categorical_fields(self, auth_client, client_feature):
        url = f'/api/clients/features/{client_feature.sk_id_curr}/'
        response = auth_client.get(url)
        assert response.status_code == 200
        categorical = response.data['categorical_features']
        assert 'FLAG_OWN_CAR' in categorical
        assert 'NAME_EDUCATION_TYPE' in categorical

    @patch('api.views.get_currency_rate')
    def test_get_features_currency_conversion(self, mock_rate, auth_client, client_feature):
        mock_rate.return_value = 90.0
        url = f'/api/clients/features/{client_feature.sk_id_curr}/?currency=USD'
        response = auth_client.get(url)
        assert response.status_code == 200
        numeric = response.data['numeric_features']
        assert numeric['AMT_INCOME_TOTAL'] == pytest.approx(200000.0 / 90.0, rel=0.01)
