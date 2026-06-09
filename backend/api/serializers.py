from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from .models import Experiment, MLModel

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
        fields = ['email', 'password', 'password2', 'first_name', 'last_name']

    def validate(self, data):
        if data['password'] != data['password2']:
            raise serializers.ValidationError({"password": "Passwords do not match."})
        try:
            validate_password(data['password'])
        except DjangoValidationError as e:
            raise serializers.ValidationError({"password": list(e.messages)})
        return data

    def create(self, validated_data): # Create user
        validated_data.pop('password2')
        user = User.objects.create_user(
            username=validated_data['email'],
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
        )
        return user

class ExperimentSerializer(serializers.ModelSerializer):
    amt_income = serializers.DecimalField(
        max_digits=15, decimal_places=2, required=False, allow_null=True, default=None
    )
    amt_credit = serializers.DecimalField(
        max_digits=15, decimal_places=2, required=False, allow_null=True, default=None
    )
    overrides = serializers.DictField(
        child=serializers.FloatField(allow_null=True),
        required=False,
        default=dict,
        write_only=True,
    )
    categorical_overrides = serializers.DictField(
        child=serializers.CharField(allow_null=True),
        required=False,
        default=dict,
        write_only=True,
    )
    model_id = serializers.IntegerField(
        required=False, allow_null=True, write_only=True,
    )
    ml_model_name = serializers.SerializerMethodField(read_only=True)
    experiment_type = serializers.CharField(read_only=True)
    results = serializers.JSONField(read_only=True)

    def get_ml_model_name(self, obj):
        return obj.ml_model.name if obj.ml_model else None

    class Meta:
        model = Experiment
        fields = [
            'id', 'sk_id_curr', 'amt_income', 'amt_credit', 'currency',
            'probability', 'risk_label', 'shap_values', 'created_at',
            'overrides', 'categorical_overrides', 'model_id', 'ml_model_name',
            'experiment_type', 'results',
        ]
        read_only_fields = [
            'id', 'probability', 'risk_label', 'shap_values', 'created_at',
            'ml_model_name', 'experiment_type', 'results',
        ]

    def create(self, validated_data):
        validated_data.pop('overrides', None)
        validated_data.pop('categorical_overrides', None)
        validated_data.pop('model_id', None)
        return super().create(validated_data)