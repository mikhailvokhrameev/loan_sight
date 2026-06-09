from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth import get_user_model
from .models import Experiment

User = get_user_model()


@admin.register(Experiment)
class ExperimentAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'experiment_type', 'sk_id_curr', 'risk_label', 'created_at')
    list_filter = ('experiment_type', 'risk_label')
    search_fields = ('user__email', 'sk_id_curr')
    ordering = ('-created_at',)


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    """
    Custom admin configuration for the User model.
    Extends Django's built-in UserAdmin by adding the
    Home Credit customer identifier field.
    """

    model = User

    # Columns displayed in the user list view
    list_display = (
        'email',
        'first_name',
        'last_name',
        'is_staff',
        'sk_id_curr',
    )

    # Fields that can be searched from the admin search bar
    search_fields = (
        'email',
        'first_name',
        'last_name',
        'sk_id_curr',
    )

    # Default ordering of users in the admin panel
    ordering = ('email',)

    # Additional section shown when editing an existing user
    fieldsets = UserAdmin.fieldsets + (
        ('Home Credit Data', {
            'fields': ('sk_id_curr',),
            'description': (
                'Customer identifier used to link a user '
                'with records in the Home Credit scoring dataset.'
            ),
        }),
    )

    # Additional section shown when creating a new user
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('Home Credit Data', {
            'fields': ('sk_id_curr',),
        }),
    )