import logging
from rest_framework import viewsets, generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from django.contrib.auth import get_user_model
from .models import Application, ClientFeature, RAW_FEATURES
from .serializers import ApplicationSerializer, UserSerializer, RegisterSerializer
from .utils import predict_credit_risk, get_shap_values

logger = logging.getLogger(__name__)

User = get_user_model() # Get current user model

class CustomTokenObtainPairView(TokenObtainPairView):
    """
    Custom class for obtaining JWT access and refresh tokens
    """
    pass

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

class ApplicationViewSet(viewsets.ModelViewSet):
    """
    A robust ViewSet that automatically provides CRUDS actions (List, Create, Retrieve, Update, Delete)
    for credit applications. Completely restricted to authenticated users.
    """
    serializer_class = ApplicationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Users can only see their own application records, ordered by newest first
        return Application.objects.filter(user=self.request.user).order_by('-created_at')

    def perform_create(self, serializer):
        """
        Intercepts the creation logic to automatically trigger the ML credit risk model
        before saving the instance to the database. Validates ML response to ensure user exists.
        """
        user = self.request.user
        sk_id_curr = serializer.validated_data.get('sk_id_curr')
        amt_income = serializer.validated_data.get('amt_income')
        amt_credit = serializer.validated_data.get('amt_credit')
        currency = serializer.validated_data.get('currency', 'RUB')
        overrides = serializer.validated_data.get('overrides') or {}

        # Invoke the external ML scoring function using user metadata and request data
        probability, risk_label = predict_credit_risk(
            sk_id_curr=sk_id_curr,
            amt_income=amt_income,
            amt_credit=amt_credit,
            currency=currency,
            overrides=overrides,
        )

        # Stop the execution if the ML engine reports that the client is missing
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
                overrides=overrides,
            )
        except Exception as exc:
            logger.warning("SHAP computation failed for sk_id_curr=%s: %s", sk_id_curr, exc)

        # Save the application object into DB with calculated ML parameters and the owner
        serializer.save(
            user=user,
            probability=probability,
            risk_label=risk_label,
            sk_id_curr=sk_id_curr,
            shap_values=shap_data,
        )


class ExplainView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        sk_id_curr = request.data.get('sk_id_curr')
        amt_income = request.data.get('amt_income')
        amt_credit = request.data.get('amt_credit')
        currency = request.data.get('currency', 'RUB')
        overrides = request.data.get('overrides') or {}

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
                overrides=overrides,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
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
            return Response({'detail': f'Invalid filter value: {exc}'}, status=status.HTTP_400_BAD_REQUEST)

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