import os
import requests
import pandas as pd
import numpy as np
import lightgbm as lgb
from django.conf import settings # Get the root directory of a Django project
from django.core.cache import cache

# Lazy loading mechanism: the model and heavy data files are loaded into
# the server's RAM only once (at the first request), rather than with each function call.
_model = None
_features_df = None
_default_features = None

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

def get_features_df():
    """
    Loads only the test_features dataset (improvised client database).
    """
    global _features_df
    if _features_df is None:
        test_path = os.path.join(settings.BASE_DIR, 'ml_models', 'test_features.parquet')
        
        if os.path.exists(test_path):
            _features_df = pd.read_parquet(test_path)
            # Ensure unique client IDs and set them as the DataFrame index for fast O(1) lookups
            if 'SK_ID_CURR' in _features_df.columns:
                _features_df.drop_duplicates(subset=['SK_ID_CURR'], inplace=True)
                _features_df.set_index('SK_ID_CURR', inplace=True)
        else:
            _features_df = pd.DataFrame()
            print(f"Warning: Client database not found at {test_path}")
            
    return _features_df

def get_default_features():
    """
    Generates a fallback feature dictionary filled with column averages 
    for completely new clients not found in the test dataset.
    """
    global _default_features
    if _default_features is None:
        df = get_features_df()
        if not df.empty:
            _default_features = df.mean().to_dict()
        else:
            model = get_model()
            _default_features = {col: 0.0 for col in model.feature_name()}
    return _default_features.copy()

def predict_credit_risk(sk_id_curr, amt_income, amt_credit, currency):
    """
    Main scoring function. Converts currency, fetches client history,
    updates requested loan parameters, and predicts default probability.
    """
    # Convert incoming financial data to base currency in real-time
    rate = get_currency_rate(currency, base_currency='RUB')
    amt_income_base = float(amt_income) * rate
    amt_credit_base = float(amt_credit) * rate
    
    # Initialize Model and Client Data
    model = get_model()
    feature_names = model.feature_name()
    
    df = get_features_df()
    if sk_id_curr and not df.empty and sk_id_curr in df.index:
        feature_dict = df.loc[sk_id_curr].to_dict()
    else:
        feature_dict = get_default_features()
        
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
    safe_annuity = max(feature_dict['AMT_ANNUITY'], 1.0) # Using max(..., 1.0) to prevent ZeroDivisionError
    
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