from rest_framework import viewsets, generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.views import TokenObtainPairView
from django.contrib.auth import get_user_model
from .models import Application
from .serializers import ApplicationSerializer, UserSerializer, RegisterSerializer
from .utils import predict_credit_risk

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
        
        # Save the application object into DB with calculated ML parameters and the owner
        serializer.save(
            user=user,
            probability=probability,
            risk_label=risk_label,
            sk_id_curr=sk_id_curr
        )