import pytest
from unittest.mock import MagicMock, patch
from api.authentication import CookieJWTAuthentication


class TestCookieJWTAuthentication:
    def test_authenticate_from_cookie(self, user):
        from rest_framework_simplejwt.tokens import RefreshToken
        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)

        request = MagicMock()
        request.COOKIES = {'access_token': access_token}

        auth = CookieJWTAuthentication()
        result = auth.authenticate(request)
        assert result is not None
        authenticated_user, token = result
        assert authenticated_user.pk == user.pk

    def test_authenticate_no_cookie_falls_back_to_header(self, user):
        from rest_framework_simplejwt.tokens import RefreshToken
        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)

        request = MagicMock()
        request.COOKIES = {}
        request.META = {'HTTP_AUTHORIZATION': f'Bearer {access_token}'}
        # Properly simulate headers for DRF
        request.headers = {'Authorization': f'Bearer {access_token}'}

        auth = CookieJWTAuthentication()
        # Parent class authenticate() uses request.META, so we patch super()
        with patch.object(
            CookieJWTAuthentication.__bases__[0],
            'authenticate',
            return_value=('user', 'token'),
        ) as mock_super:
            result = auth.authenticate(request)
            mock_super.assert_called_once_with(request)

    def test_authenticate_no_cookie_no_header(self, db):
        request = MagicMock()
        request.COOKIES = {}
        request.META = {}
        request.headers = {}

        auth = CookieJWTAuthentication()
        with patch.object(
            CookieJWTAuthentication.__bases__[0],
            'authenticate',
            return_value=None,
        ):
            result = auth.authenticate(request)
            assert result is None

    def test_authenticate_invalid_cookie(self, db):
        request = MagicMock()
        request.COOKIES = {'access_token': 'invalid.token.here'}

        auth = CookieJWTAuthentication()
        from rest_framework_simplejwt.exceptions import InvalidToken
        with pytest.raises(InvalidToken):
            auth.authenticate(request)


class TestCompareModelsView:
    url = '/api/compare/'

    def test_missing_sk_id_curr(self, auth_client, db):
        response = auth_client.post(self.url, {'model_id_a': 1, 'model_id_b': 2}, format='json')
        assert response.status_code == 400
        assert 'sk_id_curr' in response.data.get('detail', '')

    def test_missing_model_ids(self, auth_client, db):
        response = auth_client.post(self.url, {'sk_id_curr': 100001}, format='json')
        assert response.status_code == 400

    def test_same_model_ids(self, auth_client, db):
        response = auth_client.post(self.url, {
            'sk_id_curr': 100001,
            'model_id_a': 1,
            'model_id_b': 1,
        }, format='json')
        assert response.status_code == 400
        assert 'different' in response.data.get('detail', '').lower()

    def test_unauthenticated(self, api_client, db):
        response = api_client.post(self.url, {})
        assert response.status_code == 401

    @patch('api.views.predict_credit_risk')
    @patch('api.views.get_shap_values')
    @patch('api.views.get_client_features_dict')
    def test_compare_success(
        self, mock_features, mock_shap, mock_predict,
        auth_client, client_feature, db
    ):
        from api.models import MLModel
        from unittest.mock import MagicMock

        model_a = MagicMock(spec=MLModel)
        model_a.id = 1
        model_a.name = 'Model A'
        model_a.model_type = 'lgbm'
        model_b = MagicMock(spec=MLModel)
        model_b.id = 2
        model_b.name = 'Model B'
        model_b.model_type = 'xgb'

        def fake_get(pk, is_active):
            if pk == 1:
                return model_a
            if pk == 2:
                return model_b
            raise MLModel.DoesNotExist

        mock_predict.return_value = (0.05, 'Low')
        mock_shap.return_value = {'expected_value': 0.1, 'features': {}, 'other_sum': 0.0, 'n_other': 0}
        mock_features.return_value = {'AMT_INCOME_TOTAL': 200000, 'AMT_CREDIT': 500000}

        with patch('api.views.MLModel') as mock_mlmodel_cls:
            mock_mlmodel_cls.objects.get.side_effect = fake_get
            mock_mlmodel_cls.DoesNotExist = MLModel.DoesNotExist

            response = auth_client.post(self.url, {
                'sk_id_curr': client_feature.sk_id_curr,
                'model_id_a': 1,
                'model_id_b': 2,
            }, format='json')

        assert response.status_code == 200
        assert 'model_a' in response.data
        assert 'model_b' in response.data
        assert 'score_diff_pp' in response.data

    @patch('api.views.predict_credit_risk')
    @patch('api.views.get_client_features_dict')
    def test_compare_model_not_found(self, mock_features, mock_predict, auth_client, db):
        response = auth_client.post(self.url, {
            'sk_id_curr': 100001,
            'model_id_a': 9998,
            'model_id_b': 9999,
        }, format='json')
        assert response.status_code == 400


class TestSerializers:
    def test_register_serializer_password_mismatch(self, db):
        from api.serializers import RegisterSerializer
        data = {
            'email': 'test@example.com',
            'password': 'StrongPass123!',
            'password2': 'MismatchPass!',
        }
        s = RegisterSerializer(data=data)
        assert not s.is_valid()
        assert 'password' in s.errors

    def test_register_serializer_valid(self, db):
        from api.serializers import RegisterSerializer
        data = {
            'email': 'valid@example.com',
            'password': 'StrongPass123!',
            'password2': 'StrongPass123!',
        }
        s = RegisterSerializer(data=data)
        assert s.is_valid(), s.errors

    def test_experiment_serializer_ml_model_name_none(self, db, user):
        from api.serializers import ExperimentSerializer
        from api.models import Experiment
        exp = Experiment.objects.create(
            user=user,
            amt_income=100000,
            amt_credit=300000,
            ml_model=None,
            probability=[0.05],
            risk_label=['Low'],
        )
        s = ExperimentSerializer(exp)
        assert s.data['ml_model_name'] is None

    def test_experiment_serializer_ml_model_name_set(self, db, user, ml_model):
        from api.serializers import ExperimentSerializer
        from api.models import Experiment
        exp = Experiment.objects.create(
            user=user,
            amt_income=100000,
            amt_credit=300000,
            ml_model=ml_model,
            probability=[0.05],
            risk_label=['Low'],
        )
        s = ExperimentSerializer(exp)
        assert s.data['ml_model_name'] == ml_model.name
