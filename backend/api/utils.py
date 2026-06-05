import os
import logging
import requests
import numpy as np
import lightgbm as lgb
import shap
from django.conf import settings
from django.core.cache import cache
from .models import ClientFeature, RAW_FEATURES

logger = logging.getLogger(__name__)

# Lazy loading mechanism: the model is loaded into the server's RAM only once
_model = None

def get_currency_rate(target_currency, base_currency='RUB'):
    """
    Fetches the real-time exchange rate from an external API.
    Uses Django's caching system to store the rate for 1 hour.
    """
    target_currency = target_currency.upper()
    base_currency = base_currency.upper()
    
    if target_currency == base_currency:
        return 1.0

    # Create a unique cache key for this currency pair
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
                # Cache the successful result for 1 hour
                cache.set(cache_key, rate, timeout=3600)
            else:
                # Fallback if the base currency is not in the API response
                rate = 1.0 
        except requests.RequestException as e:
            # Fallback to 1.0 to avoid crashing the application if the API is down
            print(f"Warning: Currency API failed. Using 1:1 rate. Error: {e}")
            rate = 1.0

    return rate

def get_model():
    """
    Loads the LightGBM model into memory once.
    """
    global _model
    if _model is None:
        model_path = os.path.join(settings.BASE_DIR, 'ml_models', 'model.txt')
        if os.path.exists(model_path):
            _model = lgb.Booster(model_file=model_path)
        else:
            raise FileNotFoundError(f"LightGBM model file not found at {model_path}")
    return _model

def get_client_features_dict(sk_id_curr):
    """
    Retrieves client features from the database.
    Returns a dictionary of all features for the given sk_id_curr.
    """
    try:
        client = ClientFeature.objects.get(sk_id_curr=sk_id_curr)
        
        # Convert all feature fields into a dictionary
        feature_dict = {'SK_ID_CURR': sk_id_curr}
        for feature in RAW_FEATURES:
            sanitized_field = feature.lower().replace(' ', '_').replace(':', '_').replace('-', '_').replace('__', '_')
            value = getattr(client, sanitized_field, None)
            # Store original feature name (uppercase) for model
            feature_dict[feature] = value if value is not None else 0.0
            
        return feature_dict
    except ClientFeature.DoesNotExist:
        return None

def predict_credit_risk(sk_id_curr, amt_income, amt_credit, currency):
    """
    Main scoring function. Converts currency, fetches client data from DB,
    updates requested loan parameters, and predicts default probability.
    """
    model = get_model()
    feature_names, X_arr, error = _build_feature_array(sk_id_curr, amt_income, amt_credit, currency)
    if error:
        return None, error

    prob = float(model.predict(X_arr)[0])

    if prob < 0.07:
        risk_label = 'Low'
    elif prob < 0.14:
        risk_label = 'Medium'
    else:
        risk_label = 'High'

    return prob, risk_label


def _build_feature_array(sk_id_curr, amt_income, amt_credit, currency):
    """
    Shared helper: converts currency, fetches client data, applies overrides,
    and returns (feature_names, X_arr) ready for model inference.
    """
    rate = get_currency_rate(currency, base_currency='RUB')
    amt_income_base = float(amt_income) * rate
    amt_credit_base = float(amt_credit) * rate

    model = get_model()
    feature_names = model.feature_name()

    if sk_id_curr:
        feature_dict = get_client_features_dict(sk_id_curr)
        if feature_dict is None:
            return None, None, "Client not found in database"
    else:
        return None, None, "Client ID not provided"

    original_credit = max(float(feature_dict.get('AMT_CREDIT', 500000.0)), 1.0)
    original_annuity = float(feature_dict.get('AMT_ANNUITY', 25000.0))
    original_goods_price = float(feature_dict.get('AMT_GOODS_PRICE', original_credit))

    annuity_ratio = original_annuity / original_credit
    goods_ratio = original_goods_price / original_credit

    feature_dict['AMT_INCOME_TOTAL'] = amt_income_base
    feature_dict['AMT_CREDIT'] = amt_credit_base
    feature_dict['AMT_ANNUITY'] = amt_credit_base * annuity_ratio
    feature_dict['AMT_GOODS_PRICE'] = amt_credit_base * goods_ratio

    safe_income = max(amt_income_base, 1.0)
    safe_annuity = max(feature_dict['AMT_ANNUITY'], 1.0)

    feature_dict['CREDIT_INCOME_RATIO'] = amt_credit_base / safe_income
    feature_dict['CREDIT_INCOME_PERCENT'] = amt_credit_base / safe_income
    feature_dict['ANNUITY_INCOME_RATIO'] = feature_dict['AMT_ANNUITY'] / safe_income
    feature_dict['ANNUITY_INCOME_PERCENT'] = feature_dict['AMT_ANNUITY'] / safe_income
    feature_dict['CREDIT_ANNUITY_RATIO'] = amt_credit_base / safe_annuity
    feature_dict['CREDIT_TERM'] = annuity_ratio
    feature_dict['CREDIT_GOODS_RATIO'] = goods_ratio

    X = []
    for col in feature_names:
        val = feature_dict.get(col, 0.0)
        if val is None or (isinstance(val, float) and np.isnan(val)):
            val = 0.0
        X.append(val)

    X_arr = np.array([X], dtype=np.float32)
    return feature_names, X_arr, None


def get_shap_values(sk_id_curr, amt_income, amt_credit, currency, top_n=15):
    """
    Returns SHAP waterfall data:
      {expected_value, features: {name: float}, other_sum, n_other}
    Values are in log-odds space (LightGBM margin output).
    """
    model = get_model()
    feature_names, X_arr, error = _build_feature_array(sk_id_curr, amt_income, amt_credit, currency)
    if error:
        raise ValueError(error)

    explainer = shap.TreeExplainer(model)
    shap_matrix = explainer.shap_values(X_arr)

    # expected_value: scalar for binary classification, array for multiclass
    ev = explainer.expected_value
    expected_value = float(np.asarray(ev).flat[0])

    # shap_matrix shape: (1, n_features)
    raw_values = shap_matrix[0]

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