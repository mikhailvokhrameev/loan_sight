from rest_framework import serializers # DRF tools for creating serializers
from django.contrib.auth import get_user_model
from .models import Application # Connecting the application model

User = get_user_model() # Get current user model

class UserSerializer(serializers.ModelSerializer): # Serializer for reading user data (GET requests)
    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'sk_id_curr']
        read_only_fields = ['id', 'email']

class RegisterSerializer(serializers.ModelSerializer): # Serializer for user creation (POST /register)
    password = serializers.CharField(write_only=True, min_length=8)
    password2 = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['email', 'password', 'password2', 'first_name', 'last_name', 'sk_id_curr']

    def validate(self, data):
        if data['password'] != data['password2']:
            raise serializers.ValidationError({"password": "Passwords do not match."})
        return data

    def create(self, validated_data): # Create user
        validated_data.pop('password2')
        user = User.objects.create_user(
            username=validated_data['email'],
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            sk_id_curr=validated_data.get('sk_id_curr')
        )
        return user

class ApplicationSerializer(serializers.ModelSerializer): # Loan application serializer
    class Meta:
        model = Application
        fields = ['id', 'amt_income', 'amt_credit', 'currency', 'probability', 'risk_label', 'created_at']
        read_only_fields = ['id', 'probability', 'risk_label', 'created_at']