import pytest
import numpy as np
from unittest.mock import patch, MagicMock
from api.utils import (
    get_currency_rate,
    get_default_model_id,
    get_client_features_dict,
    predict_credit_risk,
    _build_feature_array,
    LABEL_MAPPINGS,
    LABEL_MAPPINGS_INVERSE,
    MONETARY_FIELDS,
)


class TestGetCurrencyRate:
    def test_same_currency_returns_1(self, db):
        rate = get_currency_rate('RUB', base_currency='RUB')
        assert rate == 1.0

    @patch('api.utils.requests.get')
    def test_success_from_api(self, mock_get, db):
        mock_response = MagicMock()
        mock_response.json.return_value = {'rates': {'RUB': 90.5}}
        mock_response.raise_for_status.return_value = None
        mock_get.return_value = mock_response

        from django.core.cache import cache
        cache.clear()

        rate = get_currency_rate('USD', base_currency='RUB')
        assert rate == 90.5

    @patch('api.utils.requests.get')
    def test_api_failure_returns_1(self, mock_get, db):
        import requests
        mock_get.side_effect = requests.RequestException('timeout')

        from django.core.cache import cache
        cache.clear()

        rate = get_currency_rate('EUR', base_currency='RUB')
        assert rate == 1.0

    @patch('api.utils.requests.get')
    def test_uses_cache_on_second_call(self, mock_get, db):
        mock_response = MagicMock()
        mock_response.json.return_value = {'rates': {'RUB': 85.0}}
        mock_response.raise_for_status.return_value = None
        mock_get.return_value = mock_response

        from django.core.cache import cache
        cache.clear()

        rate1 = get_currency_rate('GBP', base_currency='RUB')
        rate2 = get_currency_rate('GBP', base_currency='RUB')
        assert rate1 == rate2
        assert mock_get.call_count == 1

    @patch('api.utils.requests.get')
    def test_missing_rate_in_response_returns_1(self, mock_get, db):
        mock_response = MagicMock()
        mock_response.json.return_value = {'rates': {}}
        mock_response.raise_for_status.return_value = None
        mock_get.return_value = mock_response

        from django.core.cache import cache
        cache.clear()

        rate = get_currency_rate('XYZ', base_currency='RUB')
        assert rate == 1.0


class TestGetDefaultModelId:
    def test_no_models_raises(self, db):
        with pytest.raises(RuntimeError, match='No active ML models'):
            get_default_model_id()

    def test_returns_first_active_model_id(self, ml_model):
        result = get_default_model_id()
        assert result == ml_model.id

    def test_inactive_model_not_returned(self, db, ml_model):
        ml_model.is_active = False
        ml_model.save()
        with pytest.raises(RuntimeError):
            get_default_model_id()


class TestGetClientFeaturesDict:
    def test_returns_none_for_missing_client(self, db):
        result = get_client_features_dict(999999)
        assert result is None

    def test_returns_dict_for_existing_client(self, client_feature):
        result = get_client_features_dict(client_feature.sk_id_curr)
        assert result is not None
        assert result['SK_ID_CURR'] == client_feature.sk_id_curr
        assert 'AMT_INCOME_TOTAL' in result
        assert 'AMT_CREDIT' in result

    def test_includes_all_raw_features(self, client_feature):
        from api.models import RAW_FEATURES
        result = get_client_features_dict(client_feature.sk_id_curr)
        for feature in RAW_FEATURES:
            assert feature in result


class TestBuildFeatureArray:
    def _make_mock_model(self, ml_model):
        mock_estimator = MagicMock()
        mock_estimator.predict_proba.return_value = np.array([[0.95, 0.05]])
        mock_entry = MagicMock()
        mock_entry.feature_names = ['EXT_SOURCE_1', 'EXT_SOURCE_2', 'EXT_SOURCE_3',
                                     'AMT_INCOME_TOTAL', 'AMT_CREDIT', 'AMT_ANNUITY',
                                     'AMT_GOODS_PRICE', 'DAYS_BIRTH', 'DAYS_EMPLOYED',
                                     'CREDIT_ANNUITY_RATIO', 'CREDIT_INCOME_RATIO',
                                     'ANNUITY_INCOME_RATIO', 'CREDIT_INCOME_PERCENT',
                                     'ANNUITY_INCOME_PERCENT', 'CREDIT_TERM',
                                     'DAYS_EMPLOYED_PERCENT', 'CREDIT_GOODS_RATIO',
                                     'EXT_SOURCES_MEAN', 'EXT_SOURCES_PROD', 'EXT_SOURCES_STD',
                                     'EMPLOYED_TO_BIRTH_RATIO', 'CAR_TO_BIRTH_RATIO',
                                     'PHONE_TO_BIRTH_RATIO']
        return mock_estimator, mock_entry

    @patch('api.utils.get_model')
    @patch('api.utils.get_currency_rate')
    def test_client_not_found_returns_error(self, mock_rate, mock_get_model, db, ml_model):
        mock_rate.return_value = 1.0
        mock_estimator, mock_entry = self._make_mock_model(ml_model)
        mock_get_model.return_value = (mock_estimator, mock_entry)

        feature_names, X_arr, error = _build_feature_array(
            sk_id_curr=999999,
            amt_income=100000,
            amt_credit=300000,
            currency='RUB',
            model_id=ml_model.id,
        )
        assert error == 'Client not found in database'
        assert feature_names is None

    @patch('api.utils.get_model')
    @patch('api.utils.get_currency_rate')
    def test_no_sk_id_returns_error(self, mock_rate, mock_get_model, db, ml_model):
        mock_rate.return_value = 1.0
        mock_estimator, mock_entry = self._make_mock_model(ml_model)
        mock_get_model.return_value = (mock_estimator, mock_entry)

        feature_names, X_arr, error = _build_feature_array(
            sk_id_curr=None,
            amt_income=100000,
            amt_credit=300000,
            currency='RUB',
            model_id=ml_model.id,
        )
        assert error == 'Client ID not provided'

    @patch('api.utils.get_model')
    @patch('api.utils.get_currency_rate')
    def test_builds_array_successfully(self, mock_rate, mock_get_model, client_feature, ml_model):
        mock_rate.return_value = 1.0
        mock_estimator, mock_entry = self._make_mock_model(ml_model)
        mock_get_model.return_value = (mock_estimator, mock_entry)

        feature_names, X_arr, error = _build_feature_array(
            sk_id_curr=client_feature.sk_id_curr,
            amt_income=200000,
            amt_credit=500000,
            currency='RUB',
            model_id=ml_model.id,
        )
        assert error is None
        assert X_arr is not None
        assert X_arr.shape[0] == 1
        assert len(X_arr[0]) == len(mock_entry.feature_names)

    @patch('api.utils.get_model')
    @patch('api.utils.get_currency_rate')
    def test_currency_conversion_applied(self, mock_rate, mock_get_model, client_feature, ml_model):
        mock_rate.return_value = 90.0
        mock_estimator, mock_entry = self._make_mock_model(ml_model)
        mock_get_model.return_value = (mock_estimator, mock_entry)

        feature_names, X_arr, error = _build_feature_array(
            sk_id_curr=client_feature.sk_id_curr,
            amt_income=1000,
            amt_credit=None,
            currency='USD',
            model_id=ml_model.id,
        )
        assert error is None

    @patch('api.utils.get_model')
    @patch('api.utils.get_currency_rate')
    def test_overrides_applied(self, mock_rate, mock_get_model, client_feature, ml_model):
        mock_rate.return_value = 1.0
        mock_estimator, mock_entry = self._make_mock_model(ml_model)
        mock_get_model.return_value = (mock_estimator, mock_entry)

        feature_names, X_arr, error = _build_feature_array(
            sk_id_curr=client_feature.sk_id_curr,
            amt_income=None,
            amt_credit=None,
            currency='RUB',
            overrides={'EXT_SOURCE_1': 0.9},
            model_id=ml_model.id,
        )
        assert error is None


class TestPredictCreditRisk:
    def _make_mock_model(self, prob, feature_names=None):
        mock_estimator = MagicMock()
        mock_estimator.predict_proba.return_value = np.array([[1 - prob, prob]])
        # Not a Pipeline
        from sklearn.pipeline import Pipeline
        mock_estimator.__class__ = MagicMock
        mock_estimator.__class__.__mro__ = [object]

        mock_entry = MagicMock()
        mock_entry.feature_names = feature_names or ['EXT_SOURCE_1', 'EXT_SOURCE_2']
        return mock_estimator, mock_entry

    @patch('api.utils.get_model')
    @patch('api.utils.get_currency_rate')
    def test_low_risk(self, mock_rate, mock_get_model, client_feature, ml_model):
        mock_rate.return_value = 1.0
        mock_est = MagicMock()
        mock_est.predict_proba.return_value = np.array([[0.98, 0.02]])
        mock_entry = MagicMock()
        mock_entry.feature_names = ['EXT_SOURCE_1']
        mock_get_model.return_value = (mock_est, mock_entry)

        prob, label = predict_credit_risk(
            sk_id_curr=client_feature.sk_id_curr,
            amt_income=200000,
            amt_credit=500000,
            currency='RUB',
            model_id=ml_model.id,
        )
        assert label == 'Low'
        assert prob == pytest.approx(0.02)

    @patch('api.utils.get_model')
    @patch('api.utils.get_currency_rate')
    def test_medium_risk(self, mock_rate, mock_get_model, client_feature, ml_model):
        mock_rate.return_value = 1.0
        mock_est = MagicMock()
        mock_est.predict_proba.return_value = np.array([[0.90, 0.10]])
        mock_entry = MagicMock()
        mock_entry.feature_names = ['EXT_SOURCE_1']
        mock_get_model.return_value = (mock_est, mock_entry)

        prob, label = predict_credit_risk(
            sk_id_curr=client_feature.sk_id_curr,
            amt_income=200000,
            amt_credit=500000,
            currency='RUB',
            model_id=ml_model.id,
        )
        assert label == 'Medium'

    @patch('api.utils.get_model')
    @patch('api.utils.get_currency_rate')
    def test_high_risk(self, mock_rate, mock_get_model, client_feature, ml_model):
        mock_rate.return_value = 1.0
        mock_est = MagicMock()
        mock_est.predict_proba.return_value = np.array([[0.70, 0.30]])
        mock_entry = MagicMock()
        mock_entry.feature_names = ['EXT_SOURCE_1']
        mock_get_model.return_value = (mock_est, mock_entry)

        prob, label = predict_credit_risk(
            sk_id_curr=client_feature.sk_id_curr,
            amt_income=200000,
            amt_credit=500000,
            currency='RUB',
            model_id=ml_model.id,
        )
        assert label == 'High'

    @patch('api.utils.get_model')
    @patch('api.utils.get_currency_rate')
    def test_client_not_found_returns_error_label(self, mock_rate, mock_get_model, db, ml_model):
        mock_rate.return_value = 1.0
        mock_est = MagicMock()
        mock_entry = MagicMock()
        mock_entry.feature_names = ['EXT_SOURCE_1']
        mock_get_model.return_value = (mock_est, mock_entry)

        prob, label = predict_credit_risk(
            sk_id_curr=999999,
            amt_income=100000,
            amt_credit=300000,
            currency='RUB',
            model_id=ml_model.id,
        )
        assert prob is None
        assert label == 'Client not found in database'


class TestLabelMappings:
    def test_label_mappings_not_empty(self):
        assert len(LABEL_MAPPINGS) > 0

    def test_inverse_mappings_consistent(self):
        for feature, mapping in LABEL_MAPPINGS.items():
            inverse = LABEL_MAPPINGS_INVERSE[feature]
            for label, code in mapping.items():
                assert inverse[code] == label

    def test_monetary_fields_defined(self):
        assert 'AMT_INCOME_TOTAL' in MONETARY_FIELDS
        assert 'AMT_CREDIT' in MONETARY_FIELDS


