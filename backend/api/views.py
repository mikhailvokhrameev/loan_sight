import logging
import os
import json
import shutil
import tempfile
from django.conf import settings
from rest_framework import viewsets, generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from django.contrib.auth import get_user_model
from .models import Experiment, ClientFeature, MLModel, RAW_FEATURES
from .serializers import ExperimentSerializer, UserSerializer, RegisterSerializer
from .utils import (
    predict_credit_risk, get_shap_values,
    LABEL_MAPPINGS, LABEL_MAPPINGS_INVERSE,
    get_client_features_dict, get_currency_rate, MONETARY_FIELDS,
    get_default_model_id,
)

logger = logging.getLogger(__name__)

User = get_user_model() # Get current user model


def _set_auth_cookies(response, access_token, refresh_token=None):
    """Sets JWT tokens as httpOnly cookies on the response"""
    secure = settings.JWT_AUTH_COOKIE_SECURE
    samesite = settings.JWT_AUTH_COOKIE_SAMESITE
    access_max_age = int(settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds())
    refresh_max_age = int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds())

    response.set_cookie(
        settings.JWT_AUTH_COOKIE,
        access_token,
        max_age=access_max_age,
        httponly=True,
        secure=secure,
        samesite=samesite,
        path='/',
    )
    if refresh_token:
        response.set_cookie(
            settings.JWT_AUTH_REFRESH_COOKIE,
            refresh_token,
            max_age=refresh_max_age,
            httponly=True,
            secure=secure,
            samesite=samesite,
            path='/',
        )


class CustomTokenObtainPairView(TokenObtainPairView):
    """Sets tokens as httpOnly cookies"""

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            _set_auth_cookies(response, response.data['access'], response.data['refresh'])
            response.data = {}
        return response


class CookieTokenRefreshView(APIView):
    """Reads refresh token from cookie, issues new tokens as cookies"""
    permission_classes = [AllowAny]

    def post(self, request):
        refresh_token = (
            request.data.get('refresh') or
            request.COOKIES.get(settings.JWT_AUTH_REFRESH_COOKIE)
        )
        if not refresh_token:
            return Response({'detail': 'Refresh token not provided.'}, status=status.HTTP_401_UNAUTHORIZED)

        serializer = TokenRefreshSerializer(data={'refresh': refresh_token})
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as e:
            raise InvalidToken(e.args[0])

        response = Response({})
        _set_auth_cookies(
            response,
            serializer.validated_data['access'],
            serializer.validated_data.get('refresh'),
        )
        return response

class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = (
            request.data.get('refresh') or
            request.COOKIES.get(settings.JWT_AUTH_REFRESH_COOKIE)
        )
        if refresh_token:
            try:
                RefreshToken(refresh_token).blacklist()
            except TokenError:
                pass

        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie(settings.JWT_AUTH_COOKIE)
        response.delete_cookie(settings.JWT_AUTH_REFRESH_COOKIE)
        return response


class RegisterView(generics.CreateAPIView):
    """
    API endpoint that allows new users to register.
    Accessible by anyone.
    """
    queryset = User.objects.all()
    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer

class CurrentUserView(generics.RetrieveUpdateAPIView):
    """
    API endpoint to retrieve or update the profile details of the currently logged-in user.
    Requires authentication token.
    """
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        # Overriding to dynamically return the current user making the request
        return self.request.user

class ExperimentViewSet(viewsets.ModelViewSet):
    serializer_class = ExperimentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Experiment.objects.filter(user=self.request.user).order_by('-created_at')

    def perform_create(self, serializer):
        user = self.request.user
        sk_id_curr = serializer.validated_data.get('sk_id_curr')
        amt_income = serializer.validated_data.get('amt_income')
        amt_credit = serializer.validated_data.get('amt_credit')
        currency = serializer.validated_data.get('currency', 'RUB')
        overrides = serializer.validated_data.get('overrides') or {}
        categorical_overrides = serializer.validated_data.get('categorical_overrides') or {}

        converted = {}
        for feature, str_value in categorical_overrides.items():
            mapping = LABEL_MAPPINGS.get(feature)
            if mapping and str_value in mapping:
                converted[feature] = float(mapping[str_value])

        combined_overrides = {**overrides, **converted}

        model_id = serializer.validated_data.get('model_id') or None
        if model_id is None:
            model_id = get_default_model_id()
        try:
            ml_model_obj = MLModel.objects.get(pk=model_id, is_active=True)
        except MLModel.DoesNotExist:
            raise ValidationError({"detail": "Selected model not found or inactive."})

        probability, risk_label = predict_credit_risk(
            sk_id_curr=sk_id_curr,
            amt_income=amt_income,
            amt_credit=amt_credit,
            currency=currency,
            overrides=combined_overrides,
            model_id=model_id,
        )

        if risk_label == 'Client not found in database':
            raise ValidationError(
                {"detail": "Your profile information could not be verified in our credit evaluation database."},
                code=status.HTTP_400_BAD_REQUEST
            )

        shap_data = None
        try:
            shap_data = get_shap_values(
                sk_id_curr=sk_id_curr,
                amt_income=amt_income,
                amt_credit=amt_credit,
                currency=currency,
                overrides=combined_overrides,
                model_id=model_id,
            )
        except Exception as exc:
            logger.warning("SHAP computation failed for sk_id_curr=%s: %s", sk_id_curr, exc)

        save_income = amt_income
        save_credit = amt_credit
        if save_income is None or save_credit is None:
            client_data = get_client_features_dict(sk_id_curr) or {}
            if save_income is None:
                save_income = float(client_data.get('AMT_INCOME_TOTAL') or 0)
            if save_credit is None:
                save_credit = float(client_data.get('AMT_CREDIT') or 0)

        serializer.save(
            user=user,
            amt_income=save_income,
            amt_credit=save_credit,
            currency=currency,
            probability=[probability],
            risk_label=[risk_label],
            sk_id_curr=sk_id_curr,
            shap_values=[shap_data] if shap_data is not None else None,
            ml_model=ml_model_obj,
            experiment_type='single',
            results=[{
                'id': ml_model_obj.id,
                'name': ml_model_obj.name,
                'model_type': ml_model_obj.model_type,
                'latency_ms': None,
            }],
        )


class ExperimentClearView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        deleted_count, _ = Experiment.objects.filter(user=request.user).delete()
        return Response({'deleted': deleted_count}, status=status.HTTP_200_OK)


class ExplainView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        sk_id_curr = request.data.get('sk_id_curr')
        amt_income = request.data.get('amt_income')
        amt_credit = request.data.get('amt_credit')
        currency = request.data.get('currency', 'RUB')
        overrides = request.data.get('overrides') or {}
        categorical_overrides = request.data.get('categorical_overrides') or {}

        converted = {}
        for feature, str_value in categorical_overrides.items():
            mapping = LABEL_MAPPINGS.get(feature)
            if mapping and str_value in mapping:
                converted[feature] = float(mapping[str_value])

        combined_overrides = {**overrides, **converted}

        if not all([sk_id_curr, amt_income, amt_credit]):
            return Response(
                {"detail": "sk_id_curr, amt_income, and amt_credit are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            shap_data = get_shap_values(
                sk_id_curr=int(sk_id_curr),
                amt_income=amt_income,
                amt_credit=amt_credit,
                currency=currency,
                overrides=combined_overrides,
                model_id=get_default_model_id(),
            )
        except ValueError as exc:
            logger.warning("ExplainView ValueError sk_id=%s: %s", sk_id_curr, exc)
            return Response({"detail": "Client not found."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as exc:
            logger.error("ExplainView error for sk_id_curr=%s: %s", sk_id_curr, exc)
            return Response(
                {"detail": "Could not compute SHAP values. Please try again later."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({"shap_values": shap_data})


def _sanitize(feature_name):
    return feature_name.lower().replace(' ', '_').replace(':', '_').replace('-', '_').replace('__', '_')


def _client_features_dict(client):
    return {feature: getattr(client, _sanitize(feature), None) for feature in RAW_FEATURES}


class ClientPresetsView(APIView):
    permission_classes = [IsAuthenticated]

    # days_birth is stored as positive integer (absolute days since birth)
    PROFILES = [
        {
            'id': 'ideal_borrower',
            'label': 'Ideal Borrower',
            'description': 'High income, 40+, strong credit history',
            'filters': {'amt_income_total__gt': 200000, 'days_birth__gt': 14600, 'ext_source_2__gt': 0.6},
        },
        {
            'id': 'at_risk',
            'label': 'At Risk',
            'description': 'Low income, multiple active credits',
            'filters': {'amt_income_total__lt': 90000, 'buro_credit_active_active_mean__gt': 0.5},
        },
        {
            'id': 'young_specialist',
            'label': 'Young Specialist',
            'description': 'Under 30, high income, limited credit score',
            'filters': {'amt_income_total__gt': 150000, 'days_birth__lt': 10950, 'ext_source_2__lt': 0.3},
        },
        {
            'id': 'typical_defaulter',
            'label': 'Typical Defaulter',
            'description': 'Low credit scores, high debt-to-income ratio',
            'filters': {'ext_source_2__lt': 0.3, 'ext_source_3__lt': 0.3, 'credit_income_ratio__gt': 5},
        },
        {
            'id': 'pensioner',
            'label': 'Pensioner',
            'description': 'Over 60, modest income, stable profile',
            'filters': {'days_birth__gt': 21900, 'amt_income_total__lt': 100000},
        },
    ]

    def get(self, request):
        results = []
        for profile in self.PROFILES:
            client = ClientFeature.objects.filter(**profile['filters']).first()
            if client is None:
                continue
            results.append({
                'id': profile['id'],
                'label': profile['label'],
                'description': profile['description'],
                'sk_id_curr': client.sk_id_curr,
                'features': _client_features_dict(client),
            })
        return Response(results)


class ClientSearchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = ClientFeature.objects.all()

        age_min = request.query_params.get('age_min')
        age_max = request.query_params.get('age_max')
        income_min = request.query_params.get('income_min')
        income_max = request.query_params.get('income_max')
        had_late_payments = request.query_params.get('had_late_payments')

        try:
            if age_min:
                qs = qs.filter(days_birth__gte=int(age_min) * 365)
            if age_max:
                qs = qs.filter(days_birth__lte=int(age_max) * 365)
            if income_min:
                qs = qs.filter(amt_income_total__gte=float(income_min))
            if income_max:
                qs = qs.filter(amt_income_total__lte=float(income_max))
            if had_late_payments and had_late_payments.lower() == 'true':
                qs = qs.filter(def_30_cnt_social_circle__gt=0)
        except (ValueError, TypeError) as exc:
            logger.warning("ClientListView invalid filter: %s", exc)
            return Response({'detail': 'Invalid filter value.'}, status=status.HTTP_400_BAD_REQUEST)

        clients = qs.order_by('?')[:10]

        results = []
        for client in clients:
            age = round(-client.days_birth / 365) if client.days_birth else None
            results.append({
                'sk_id_curr': client.sk_id_curr,
                'age': age,
                'amt_income_total': client.amt_income_total,
                'name_income_type': client.name_income_type,
                'ext_source_2': client.ext_source_2,
                'buro_credit_active_active_mean': client.buro_credit_active_active_mean,
            })
        return Response(results)


_NUMERIC_EDITABLE = [
    'AMT_INCOME_TOTAL', 'AMT_CREDIT', 'AMT_ANNUITY', 'DAYS_BIRTH',
    'DAYS_EMPLOYED', 'CNT_FAM_MEMBERS', 'AMT_GOODS_PRICE',
    'EXT_SOURCE_1', 'EXT_SOURCE_2', 'EXT_SOURCE_3',
]


class ClientFeaturesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, sk_id_curr):
        currency = request.query_params.get('currency', 'RUB').upper()
        try:
            client = ClientFeature.objects.get(sk_id_curr=sk_id_curr)
        except ClientFeature.DoesNotExist:
            return Response({'detail': 'Client not found.'}, status=status.HTTP_404_NOT_FOUND)

        numeric_features = {}
        for feature in _NUMERIC_EDITABLE:
            field = feature.lower()
            val = getattr(client, field, None)
            numeric_features[feature] = float(val) if val is not None else None

        # Convert monetary fields from RUB to the requested currency for display
        if currency != 'RUB':
            rate = get_currency_rate(currency, base_currency='RUB')
            if rate and rate > 0:
                for key in MONETARY_FIELDS:
                    if key in numeric_features and numeric_features[key] is not None:
                        numeric_features[key] = round(numeric_features[key] / rate, 2)

        categorical_features = {}
        for feature, inverse in LABEL_MAPPINGS_INVERSE.items():
            field = feature.lower()
            raw_val = getattr(client, field, None)
            if raw_val is None:
                categorical_features[feature] = None
            else:
                code = int(round(float(raw_val)))
                categorical_features[feature] = inverse.get(code)

        return Response({
            'sk_id_curr': client.sk_id_curr,
            'numeric_features': numeric_features,
            'categorical_features': categorical_features,
        })


class CompareModelsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        sk_id_curr    = request.data.get('sk_id_curr')
        currency      = request.data.get('currency', 'RUB')
        overrides     = request.data.get('overrides') or {}
        cat_overrides = request.data.get('categorical_overrides') or {}
        model_id_a    = request.data.get('model_id_a')
        model_id_b    = request.data.get('model_id_b')

        if not sk_id_curr:
            return Response({'detail': 'sk_id_curr is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not model_id_a or not model_id_b:
            return Response({'detail': 'model_id_a and model_id_b are required.'}, status=status.HTTP_400_BAD_REQUEST)
        if model_id_a == model_id_b:
            return Response({'detail': 'Please select two different models.'}, status=status.HTTP_400_BAD_REQUEST)

        converted = {}
        for feature, str_value in cat_overrides.items():
            mapping = LABEL_MAPPINGS.get(feature)
            if mapping and str_value in mapping:
                converted[feature] = float(mapping[str_value])
        combined_overrides = {**overrides, **converted}

        def score_one(model_id):
            import time
            try:
                ml_obj = MLModel.objects.get(pk=model_id, is_active=True)
            except MLModel.DoesNotExist:
                return {'error': f'Model {model_id} not found or inactive.'}

            t0 = time.perf_counter()
            try:
                prob, risk = predict_credit_risk(
                    sk_id_curr=int(sk_id_curr),
                    amt_income=None,
                    amt_credit=None,
                    currency=currency,
                    overrides=combined_overrides,
                    model_id=model_id,
                )
            except Exception as e:
                logger.error("Scoring failed model=%s: %s", model_id, e)
                return {'error': 'Scoring failed. Please try again.'}

            shap_data = None
            try:
                shap_data = get_shap_values(
                    sk_id_curr=int(sk_id_curr),
                    amt_income=None,
                    amt_credit=None,
                    currency=currency,
                    overrides=combined_overrides,
                    model_id=model_id,
                )
            except Exception as exc:
                logger.warning("SHAP failed in compare for model %s: %s", model_id, exc)

            latency_ms = round((time.perf_counter() - t0) * 1000, 1)

            return {
                'model_id': model_id,
                'model_name': ml_obj.name,
                'model_type': ml_obj.model_type,
                'probability': prob,
                'risk_label': risk,
                'latency_ms': latency_ms,
                'shap_values': shap_data,
            }

        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=2) as executor:
            fut_a = executor.submit(score_one, int(model_id_a))
            fut_b = executor.submit(score_one, int(model_id_b))
            result_a = fut_a.result()
            result_b = fut_b.result()

        if 'error' in result_a:
            return Response({'detail': result_a['error']}, status=status.HTTP_400_BAD_REQUEST)
        if 'error' in result_b:
            return Response({'detail': result_b['error']}, status=status.HTTP_400_BAD_REQUEST)

        score_diff = round(abs(result_a['probability'] - result_b['probability']) * 100, 2)

        compare_results = [
            {
                'model_id': result_a['model_id'],
                'model_name': result_a['model_name'],
                'model_type': result_a['model_type'],
                'probability': result_a['probability'],
                'risk_label': result_a['risk_label'],
                'latency_ms': result_a['latency_ms'],
                'shap_values': result_a['shap_values'],
            },
            {
                'model_id': result_b['model_id'],
                'model_name': result_b['model_name'],
                'model_type': result_b['model_type'],
                'probability': result_b['probability'],
                'risk_label': result_b['risk_label'],
                'latency_ms': result_b['latency_ms'],
                'shap_values': result_b['shap_values'],
            },
        ]

        client_data = get_client_features_dict(int(sk_id_curr)) or {}
        save_income = float(client_data.get('AMT_INCOME_TOTAL') or 0)
        save_credit = float(client_data.get('AMT_CREDIT') or 0)

        Experiment.objects.create(
            user=request.user,
            sk_id_curr=int(sk_id_curr),
            experiment_type='compare',
            amt_income=save_income,
            amt_credit=save_credit,
            currency=currency,
            probability=[result_a['probability'], result_b['probability']],
            risk_label=[result_a['risk_label'], result_b['risk_label']],
            shap_values=[result_a['shap_values'], result_b['shap_values']],
            ml_model=None,
            results=[
                {'id': result_a['model_id'], 'name': result_a['model_name'], 'model_type': result_a['model_type'], 'latency_ms': result_a['latency_ms']},
                {'id': result_b['model_id'], 'name': result_b['model_name'], 'model_type': result_b['model_type'], 'latency_ms': result_b['latency_ms']},
            ],
        )

        return Response({
            'model_a': result_a,
            'model_b': result_b,
            'score_diff_pp': score_diff,
        })


def _model_to_dict(m):
    return {
        'id': m.id,
        'name': m.name,
        'model_type': m.model_type,
        'description': m.description,
        'metrics': m.metrics,
        'created_at': m.created_at.isoformat(),
    }


def _detect_model_type(estimator):
    from sklearn.pipeline import Pipeline
    obj = estimator.steps[-1][1] if isinstance(estimator, Pipeline) else estimator
    module = type(obj).__module__
    name = type(obj).__name__.lower()
    if 'lightgbm' in module:
        return 'lgbm'
    if 'xgboost' in module:
        return 'xgb'
    if 'catboost' in module:
        return 'catboost'
    if 'logistic' in name:
        return 'logreg'
    return None


class MLModelListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        models = MLModel.objects.filter(is_active=True).order_by('created_at')
        return Response([_model_to_dict(m) for m in models])

    def post(self, request):
        name = request.data.get('name', '').strip()
        description = request.data.get('description', '').strip()
        joblib_file = request.FILES.get('joblib_file')
        metadata_file = request.FILES.get('metadata_file')

        if not name:
            return Response({'detail': 'Model name is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not joblib_file:
            return Response({'detail': 'Model file (.joblib) is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not metadata_file:
            return Response({'detail': 'Metadata file (metadata.json) is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            metadata = json.loads(metadata_file.read().decode('utf-8'))
        except Exception:
            return Response({'detail': 'Invalid metadata.json — must be valid UTF-8 JSON.'}, status=status.HTTP_400_BAD_REQUEST)

        feature_names = metadata.get('feature_names', [])
        metrics = metadata.get('metrics', {})
        thresholds = metadata.get('thresholds', {})

        tmp_fd, tmp_path = tempfile.mkstemp(suffix='.joblib')
        with os.fdopen(tmp_fd, 'wb') as tmp:
            for chunk in joblib_file.chunks():
                tmp.write(chunk)

        import joblib as jl
        try:
            estimator = jl.load(tmp_path)
        except Exception:
            os.unlink(tmp_path)
            return Response(
                {'detail': 'Failed to load model file. Make sure it is a valid joblib file.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        model_type = _detect_model_type(estimator)
        if model_type is None:
            os.unlink(tmp_path)
            return Response(
                {'detail': 'Unrecognized model type. Supported: LightGBM, XGBoost, CatBoost, LogisticRegression.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        safe_dir_name = name.replace(' ', '_').replace('/', '_')
        dest_dir = os.path.join(settings.BASE_DIR, 'ml_models', safe_dir_name)
        os.makedirs(dest_dir, exist_ok=True)
        dest_path = os.path.join(dest_dir, 'model.joblib')
        shutil.move(tmp_path, dest_path)

        obj, created = MLModel.objects.update_or_create(
            name=name,
            defaults={
                'model_type': model_type,
                'description': description,
                'joblib_path': dest_path,
                'feature_names': feature_names,
                'metrics': metrics,
                'thresholds': thresholds,
                'is_active': True,
            },
        )

        http_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(_model_to_dict(obj), status=http_status)


class MLModelDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            model = MLModel.objects.get(pk=pk)
        except MLModel.DoesNotExist:
            return Response({'detail': 'Model not found.'}, status=status.HTTP_404_NOT_FOUND)

        if model.joblib_path and os.path.isfile(model.joblib_path):
            try:
                os.remove(model.joblib_path)
                dir_path = os.path.dirname(model.joblib_path)
                if os.path.isdir(dir_path) and not os.listdir(dir_path):
                    os.rmdir(dir_path)
            except Exception:
                pass

        model.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MLModelClearView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        for model in MLModel.objects.all():
            if model.joblib_path and os.path.isfile(model.joblib_path):
                try:
                    os.remove(model.joblib_path)
                    dir_path = os.path.dirname(model.joblib_path)
                    if os.path.isdir(dir_path) and not os.listdir(dir_path):
                        os.rmdir(dir_path)
                except Exception:
                    pass
        deleted_count, _ = MLModel.objects.all().delete()
        return Response({'deleted': deleted_count}, status=status.HTTP_200_OK)