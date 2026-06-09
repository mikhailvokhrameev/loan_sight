import os
import logging
import requests
import joblib
import numpy as np
import shap
from sklearn.pipeline import Pipeline
from django.conf import settings
from django.core.cache import cache
from .models import ClientFeature, RAW_FEATURES, MLModel, _sanitize

logger = logging.getLogger(__name__)

LABEL_MAPPINGS = {
    'FLAG_OWN_CAR': {
        'No': 0, 'Yes': 1,
    },
    'FLAG_OWN_REALTY': {
        'No': 0, 'Yes': 1,
    },
    'NAME_EDUCATION_TYPE': {
        'Academic degree': 0,
        'Higher education': 1,
        'Incomplete higher': 2,
        'Lower secondary': 3,
        'Secondary / secondary special': 4,
    },
    'NAME_FAMILY_STATUS': {
        'Civil marriage': 0,
        'Married': 1,
        'Separated': 2,
        'Single / not married': 3,
        'Widow': 4,
    },
    'NAME_INCOME_TYPE': {
        'Businessman': 0,
        'Commercial associate': 1,
        'Maternity leave': 2,
        'Pensioner': 3,
        'State servant': 4,
        'Student': 5,
        'Unemployed': 6,
        'Working': 7,
    },
}

LABEL_MAPPINGS_INVERSE = {
    feature: {v: k for k, v in mapping.items()}
    for feature, mapping in LABEL_MAPPINGS.items()
}

MONETARY_FIELDS = {'AMT_INCOME_TOTAL', 'AMT_CREDIT', 'AMT_ANNUITY', 'AMT_GOODS_PRICE'}

_model_cache = {}


def get_currency_rate(target_currency, base_currency='RUB'):
    """
    Fetches the real-time exchange rate from an external API.
    Uses Django's caching system to store the rate for 1 hour.
    """
    target_currency = target_currency.upper()
    base_currency = base_currency.upper()

    if target_currency == base_currency:
        return 1.0

    cache_key = f"fx_rate_{target_currency}_{base_currency}"
    rate = cache.get(cache_key)

    if rate is None:
        try:
            api_url = f"https://open.er-api.com/v6/latest/{target_currency}"
            response = requests.get(api_url, timeout=5)
            response.raise_for_status()

            data = response.json()
            rate = data['rates'].get(base_currency)

            if rate:
                cache.set(cache_key, rate, timeout=3600)
            else:
                rate = 1.0
        except requests.RequestException as e:
            logger.warning("Currency API failed, fallback to 1:1. Error: %s", e)
            rate = 1.0

    return rate


def get_default_model_id() -> int:
    """Returns the pk of the first active MLModel, or raises if none exist."""
    entry = MLModel.objects.filter(is_active=True).order_by('created_at').first()
    if entry is None:
        raise RuntimeError("No active ML models registered. Run: python manage.py register_model --src <path> --name <name>")
    return entry.pk


def get_model(model_id: int):
    """Loads model by DB id, caches in memory. Returns (estimator, MLModel instance)."""
    if model_id not in _model_cache:
        entry = MLModel.objects.get(pk=model_id)
        estimator = joblib.load(entry.joblib_path)
        _model_cache[model_id] = (estimator, entry)
    return _model_cache[model_id]


def get_client_features_dict(sk_id_curr):
    """
    Retrieves client features from the database.
    Returns a dictionary of all features for the given sk_id_curr.
    """
    try:
        client = ClientFeature.objects.get(sk_id_curr=sk_id_curr)

        feature_dict = {'SK_ID_CURR': sk_id_curr}
        for feature in RAW_FEATURES:
            value = getattr(client, _sanitize(feature), None)
            feature_dict[feature] = value  # None preserved → NaN in X_arr; models handle missing per their type

        return feature_dict
    except ClientFeature.DoesNotExist:
        return None


def predict_credit_risk(sk_id_curr, amt_income, amt_credit, currency, overrides=None, model_id: int = None):
    """
    Main scoring function. Converts currency, fetches client data from DB,
    updates requested loan parameters, and predicts default probability.
    """
    if model_id is None:
        model_id = get_default_model_id()

    estimator, entry = get_model(model_id)
    feature_names, X_arr, error = _build_feature_array(
        sk_id_curr, amt_income, amt_credit, currency, overrides=overrides, model_id=model_id
    )
    if error:
        return None, error

    X_input = X_arr if isinstance(estimator, Pipeline) else np.where(np.isnan(X_arr), 0.0, X_arr).astype(np.float32)
    proba = float(estimator.predict_proba(X_input)[0, 1])

    if proba < 0.07:
        risk_label = 'Low'
    elif proba < 0.14:
        risk_label = 'Medium'
    else:
        risk_label = 'High'

    return proba, risk_label


def _build_feature_array(sk_id_curr, amt_income, amt_credit, currency, overrides=None, model_id: int = None):
    """
    Shared helper: converts currency, fetches client data, applies overrides,
    and returns (feature_names, X_arr) ready for model inference.
    amt_income / amt_credit may be None — in that case the DB values are used as-is.
    Monetary overrides are converted from currency to RUB using the exchange rate.
    """
    if model_id is None:
        model_id = get_default_model_id()

    _, entry = get_model(model_id)
    feature_names = entry.feature_names

    rate = get_currency_rate(currency, base_currency='RUB')

    if sk_id_curr:
        feature_dict = get_client_features_dict(sk_id_curr)
        if feature_dict is None:
            return None, None, "Client not found in database"
    else:
        return None, None, "Client ID not provided"

    if amt_income is not None:
        feature_dict['AMT_INCOME_TOTAL'] = float(amt_income) * rate

    if amt_credit is not None:
        amt_credit_base = float(amt_credit) * rate
        original_credit = max(float(feature_dict.get('AMT_CREDIT', 500000.0)), 1.0)
        original_annuity = float(feature_dict.get('AMT_ANNUITY', 25000.0))
        original_goods_price = float(feature_dict.get('AMT_GOODS_PRICE', original_credit))
        annuity_ratio = original_annuity / original_credit
        goods_ratio = original_goods_price / original_credit
        feature_dict['AMT_CREDIT'] = amt_credit_base
        feature_dict['AMT_ANNUITY'] = amt_credit_base * annuity_ratio
        feature_dict['AMT_GOODS_PRICE'] = amt_credit_base * goods_ratio

    if overrides:
        for key, value in overrides.items():
            if value is None:
                continue
            if key in MONETARY_FIELDS:
                feature_dict[key] = float(value) * rate
            else:
                feature_dict[key] = float(value)

    safe_income  = max(feature_dict.get('AMT_INCOME_TOTAL', 1.0) or 1.0, 1.0)
    safe_credit  = max(feature_dict.get('AMT_CREDIT', 1.0) or 1.0, 1.0)
    safe_annuity = max(feature_dict.get('AMT_ANNUITY', 1.0) or 1.0, 1.0)
    safe_goods   = max(feature_dict.get('AMT_GOODS_PRICE', safe_credit) or safe_credit, 1.0)
    days_birth   = feature_dict.get('DAYS_BIRTH', -1.0) or -1.0
    days_employed = feature_dict.get('DAYS_EMPLOYED', 0.0) or 0.0
    own_car_age  = feature_dict.get('OWN_CAR_AGE', 0.0) or 0.0
    days_phone   = feature_dict.get('DAYS_LAST_PHONE_CHANGE', 0.0) or 0.0
    e1 = feature_dict.get('EXT_SOURCE_1') or 0.0
    e2 = feature_dict.get('EXT_SOURCE_2') or 0.0
    e3 = feature_dict.get('EXT_SOURCE_3') or 0.0

    feature_dict['CREDIT_ANNUITY_RATIO']    = safe_credit / safe_annuity
    feature_dict['CREDIT_INCOME_RATIO']     = safe_credit / safe_income
    feature_dict['ANNUITY_INCOME_RATIO']    = safe_annuity / safe_income
    feature_dict['CREDIT_INCOME_PERCENT']   = safe_credit / safe_income
    feature_dict['ANNUITY_INCOME_PERCENT']  = safe_annuity / safe_income
    feature_dict['CREDIT_TERM']             = safe_annuity / safe_credit  # annuity/credit, not credit/annuity
    feature_dict['DAYS_EMPLOYED_PERCENT']   = days_employed / (abs(days_birth) or 1.0)
    feature_dict['CREDIT_GOODS_RATIO']      = safe_credit / safe_goods
    feature_dict['EXT_SOURCES_MEAN']        = (e1 + e2 + e3) / 3.0
    feature_dict['EXT_SOURCES_PROD']        = e1 * e2 * e3
    feature_dict['EXT_SOURCES_STD']         = float(np.std([e1, e2, e3]))
    feature_dict['EMPLOYED_TO_BIRTH_RATIO'] = days_employed / (abs(days_birth) or 1.0)
    feature_dict['CAR_TO_BIRTH_RATIO']      = own_car_age / (abs(days_birth) or 1.0)  # days, not years
    feature_dict['PHONE_TO_BIRTH_RATIO']    = days_phone / (abs(days_birth) or 1.0)   # signed, not abs

    X = []
    for col in feature_names:
        val = feature_dict.get(col)
        if val is None or (isinstance(val, float) and np.isnan(val)):
            val = np.nan
        X.append(val)

    X_arr = np.array([X], dtype=np.float32)
    return feature_names, X_arr, None


def get_shap_values(sk_id_curr, amt_income, amt_credit, currency, top_n=15, overrides=None, model_id: int = None):
    """
    Returns SHAP waterfall data:
      {expected_value, features: {name: float}, other_sum, n_other}
    """
    if model_id is None:
        model_id = get_default_model_id()

    estimator, entry = get_model(model_id)
    feature_names, X_arr, error = _build_feature_array(
        sk_id_curr, amt_income, amt_credit, currency, overrides=overrides, model_id=model_id
    )
    if error:
        raise ValueError(error)

    if isinstance(estimator, Pipeline):
        # Pipeline's SimpleImputer fills NaN with training means before scaling
        X_for_shap = estimator[:-1].transform(X_arr)
        clf = estimator.steps[-1][1]
        # Zero background = training mean in StandardScaler space
        X_background = np.zeros((1, X_for_shap.shape[1]))
        if hasattr(clf, 'coef_'):
            explainer = shap.LinearExplainer(clf, X_background)
        else:
            explainer = shap.TreeExplainer(clf)
        shap_output = explainer.shap_values(X_for_shap)
    else:
        # Tree models: replace NaN with 0.0 (same as during training)
        X_clean = np.where(np.isnan(X_arr), 0.0, X_arr).astype(np.float32)
        explainer = shap.TreeExplainer(estimator)
        shap_output = explainer.shap_values(X_clean)

    # Handle binary classification: some explainers return a list [class_0, class_1]
    if isinstance(shap_output, list):
        raw_values = np.array(shap_output[1])[0]
        ev = explainer.expected_value
        expected_value = float(np.asarray(ev).flat[-1])
    else:
        raw_values = shap_output[0]
        ev = explainer.expected_value
        expected_value = float(np.asarray(ev).flat[0])

    all_pairs = sorted(
        ((feature_names[i], float(raw_values[i])) for i in range(len(feature_names))),
        key=lambda x: abs(x[1]),
        reverse=True,
    )

    top_features = all_pairs[:top_n]
    other_features = all_pairs[top_n:]
    other_sum = float(sum(v for _, v in other_features))

    return {
        "expected_value": expected_value,
        "features": {name: val for name, val in top_features},
        "other_sum": other_sum,
        "n_other": len(other_features),
    }
