import os
import requests
import numpy as np
import lightgbm as lgb
from django.conf import settings
from django.core.cache import cache
from .models import ClientFeature, RAW_FEATURES

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
    updates requested loan parameters, saves to DB, and predicts default probability.
    """
    # Convert incoming financial data to base currency in real-time
    rate = get_currency_rate(currency, base_currency='RUB')
    amt_income_base = float(amt_income) * rate
    amt_credit_base = float(amt_credit) * rate
    
    # Initialize Model
    model = get_model()
    feature_names = model.feature_name()
    
    # Fetch client features from database
    if sk_id_curr:
        feature_dict = get_client_features_dict(sk_id_curr)
        if feature_dict is None:
            return None, "Client not found in database"
    else:
        return None, "Client ID not provided"
    
    # Extract historical loan proportions to recalculate new annuity and goods price
    original_credit = max(float(feature_dict.get('AMT_CREDIT', 500000.0)), 1.0)
    original_annuity = float(feature_dict.get('AMT_ANNUITY', 25000.0))
    original_goods_price = float(feature_dict.get('AMT_GOODS_PRICE', original_credit))
    
    annuity_ratio = original_annuity / original_credit
    goods_ratio = original_goods_price / original_credit
    
    # Overwrite base values with the new user input
    feature_dict['AMT_INCOME_TOTAL'] = amt_income_base
    feature_dict['AMT_CREDIT'] = amt_credit_base
    feature_dict['AMT_ANNUITY'] = amt_credit_base * annuity_ratio
    feature_dict['AMT_GOODS_PRICE'] = amt_credit_base * goods_ratio
    
    # Recalculate the direct derivative ratios
    safe_income = max(amt_income_base, 1.0)
    safe_annuity = max(feature_dict['AMT_ANNUITY'], 1.0)
    
    feature_dict['CREDIT_INCOME_RATIO'] = amt_credit_base / safe_income
    feature_dict['CREDIT_INCOME_PERCENT'] = amt_credit_base / safe_income
    feature_dict['ANNUITY_INCOME_RATIO'] = feature_dict['AMT_ANNUITY'] / safe_income
    feature_dict['ANNUITY_INCOME_PERCENT'] = feature_dict['AMT_ANNUITY'] / safe_income
    feature_dict['CREDIT_ANNUITY_RATIO'] = amt_credit_base / safe_annuity
    
    feature_dict['CREDIT_TERM'] = annuity_ratio
    feature_dict['CREDIT_GOODS_RATIO'] = goods_ratio
    
    # Assemble the exact feature vector expected by the LightGBM model
    X = []
    for col in feature_names:
        val = feature_dict.get(col, 0.0)
        # Clean any corrupted NaN values before feeding to the model
        if val is None or (isinstance(val, float) and np.isnan(val)):
            val = 0.0
        X.append(val)
        
    X_arr = np.array([X], dtype=np.float32)
    
    # Execute prediction
    prob = float(model.predict(X_arr)[0])
    
    # Assign risk categorization based on Home Credit dataset baseline
    if prob < 0.07:
        risk_label = 'Low'
    elif prob < 0.14:
        risk_label = 'Medium'
    else:
        risk_label = 'High'
        
    return prob, risk_label