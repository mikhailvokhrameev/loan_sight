import logging
from rest_framework import viewsets, generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from django.contrib.auth import get_user_model
from .models import Application
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
        
        # Invoke the external ML scoring function using user metadata and request data
        probability, risk_label = predict_credit_risk(
            sk_id_curr=sk_id_curr,
            amt_income=amt_income,
            amt_credit=amt_credit,
            currency=currency
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