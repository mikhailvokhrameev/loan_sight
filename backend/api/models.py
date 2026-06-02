from django.db import models
from django.contrib.auth.models import AbstractUser

class User(AbstractUser):
    username = models.CharField(max_length=150, unique=True) # Login
    email = models.EmailField(unique=True)
    sk_id_curr = models.IntegerField(null=True, blank=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    def __str__(self):
        return self.email

class Application(models.Model): # Creates a table of loan applications
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='applications') # Each application belongs to one user
    amt_income = models.DecimalField(max_digits=15, decimal_places=2)
    amt_credit = models.DecimalField(max_digits=15, decimal_places=2)
    currency = models.CharField(max_length=10, default='RUB')
    probability = models.FloatField(null=True, blank=True)
    risk_label = models.CharField(max_length=20, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"App #{self.id} - User {self.user.email} ({self.risk_label})"