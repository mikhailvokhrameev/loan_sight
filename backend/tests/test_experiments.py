import pytest
from unittest.mock import patch, MagicMock
from api.models import Experiment


LIST_URL = '/api/experiments/'
CLEAR_URL = '/api/experiments/clear/'


def make_experiment(user, ml_model, **kwargs):
    defaults = dict(
        amt_income=100000,
        amt_credit=300000,
        currency='RUB',
        probability=[0.05],
        risk_label=['Low'],
        experiment_type='single',
        results=[{'id': ml_model.id, 'name': ml_model.name, 'model_type': ml_model.model_type, 'latency_ms': None}],
    )
    defaults.update(kwargs)
    return Experiment.objects.create(user=user, ml_model=ml_model, **defaults)


class TestExperimentList:
    def test_list_empty(self, auth_client, db):
        response = auth_client.get(LIST_URL)
        assert response.status_code == 200
        assert response.data == []

    def test_list_returns_own_experiments(self, auth_client, user, ml_model):
        make_experiment(user, ml_model)
        make_experiment(user, ml_model)
        response = auth_client.get(LIST_URL)
        assert response.status_code == 200
        assert len(response.data) == 2

    def test_list_does_not_return_other_users_experiments(self, auth_client, user, second_user, ml_model):
        make_experiment(second_user, ml_model)
        response = auth_client.get(LIST_URL)
        assert response.status_code == 200
        assert len(response.data) == 0

    def test_list_unauthenticated(self, api_client, db):
        response = api_client.get(LIST_URL)
        assert response.status_code == 401


class TestExperimentRetrieve:
    def test_retrieve_own_experiment(self, auth_client, user, ml_model):
        exp = make_experiment(user, ml_model)
        response = auth_client.get(f'{LIST_URL}{exp.id}/')
        assert response.status_code == 200
        assert response.data['id'] == exp.id

    def test_retrieve_other_users_experiment_returns_404(self, auth_client, second_user, ml_model):
        exp = make_experiment(second_user, ml_model)
        response = auth_client.get(f'{LIST_URL}{exp.id}/')
        assert response.status_code == 404

    def test_retrieve_nonexistent_experiment(self, auth_client, db):
        response = auth_client.get(f'{LIST_URL}99999/')
        assert response.status_code == 404


class TestExperimentCreate:
    @patch('api.views.predict_credit_risk')
    @patch('api.views.get_shap_values')
    @patch('api.views.get_default_model_id')
    def test_create_experiment_success(
        self, mock_default_id, mock_shap, mock_predict, auth_client, user, ml_model, client_feature
    ):
        mock_default_id.return_value = ml_model.id
        mock_predict.return_value = (0.05, 'Low')
        mock_shap.return_value = {'expected_value': 0.1, 'features': {}, 'other_sum': 0.0, 'n_other': 0}

        payload = {
            'sk_id_curr': client_feature.sk_id_curr,
            'amt_income': '200000.00',
            'amt_credit': '500000.00',
            'currency': 'RUB',
            'model_id': ml_model.id,
        }
        response = auth_client.post(LIST_URL, payload, format='json')
        assert response.status_code == 201
        assert Experiment.objects.filter(user=user).count() == 1

    @patch('api.views.predict_credit_risk')
    @patch('api.views.get_default_model_id')
    def test_create_experiment_client_not_found(
        self, mock_default_id, mock_predict, auth_client, user, ml_model
    ):
        mock_default_id.return_value = ml_model.id
        mock_predict.return_value = (None, 'Client not found in database')

        payload = {
            'sk_id_curr': 999999,
            'amt_income': '100000.00',
            'amt_credit': '200000.00',
            'model_id': ml_model.id,
        }
        response = auth_client.post(LIST_URL, payload, format='json')
        assert response.status_code == 400

    @patch('api.views.get_default_model_id')
    def test_create_experiment_inactive_model(self, mock_default_id, auth_client, db, ml_model):
        ml_model.is_active = False
        ml_model.save()
        mock_default_id.return_value = ml_model.id

        payload = {
            'sk_id_curr': 100001,
            'amt_income': '100000.00',
            'amt_credit': '200000.00',
            'model_id': ml_model.id,
        }
        response = auth_client.post(LIST_URL, payload, format='json')
        assert response.status_code == 400

    def test_create_unauthenticated(self, api_client, db):
        response = api_client.post(LIST_URL, {})
        assert response.status_code == 401

    @patch('api.views.predict_credit_risk')
    @patch('api.views.get_shap_values')
    @patch('api.views.get_default_model_id')
    def test_create_with_categorical_overrides(
        self, mock_default_id, mock_shap, mock_predict, auth_client, user, ml_model, client_feature
    ):
        mock_default_id.return_value = ml_model.id
        mock_predict.return_value = (0.03, 'Low')
        mock_shap.return_value = None

        payload = {
            'sk_id_curr': client_feature.sk_id_curr,
            'amt_income': '150000.00',
            'amt_credit': '400000.00',
            'model_id': ml_model.id,
            'categorical_overrides': {'FLAG_OWN_CAR': 'Yes'},
        }
        response = auth_client.post(LIST_URL, payload, format='json')
        assert response.status_code == 201


class TestExperimentDelete:
    def test_delete_own_experiment(self, auth_client, user, ml_model):
        exp = make_experiment(user, ml_model)
        response = auth_client.delete(f'{LIST_URL}{exp.id}/')
        assert response.status_code == 204
        assert not Experiment.objects.filter(id=exp.id).exists()

    def test_delete_other_users_experiment(self, auth_client, second_user, ml_model):
        exp = make_experiment(second_user, ml_model)
        response = auth_client.delete(f'{LIST_URL}{exp.id}/')
        assert response.status_code == 404


class TestExperimentClearView:
    def test_clear_deletes_own_experiments(self, auth_client, user, ml_model):
        make_experiment(user, ml_model)
        make_experiment(user, ml_model)
        response = auth_client.delete(CLEAR_URL)
        assert response.status_code == 200
        assert response.data['deleted'] == 2
        assert Experiment.objects.filter(user=user).count() == 0

    def test_clear_does_not_delete_other_users(self, auth_client, user, second_user, ml_model):
        make_experiment(user, ml_model)
        make_experiment(second_user, ml_model)
        auth_client.delete(CLEAR_URL)
        assert Experiment.objects.filter(user=second_user).count() == 1

    def test_clear_unauthenticated(self, api_client, db):
        response = api_client.delete(CLEAR_URL)
        assert response.status_code == 401

    def test_clear_empty(self, auth_client, db):
        response = auth_client.delete(CLEAR_URL)
        assert response.status_code == 200
        assert response.data['deleted'] == 0
