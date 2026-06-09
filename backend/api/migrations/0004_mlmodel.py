from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0003_application_shap_values"),
    ]

    operations = [
        migrations.CreateModel(
            name="MLModel",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=100, unique=True)),
                ("model_type", models.CharField(max_length=50)),
                ("joblib_path", models.CharField(max_length=500)),
                ("feature_names", models.JSONField()),
                ("metrics", models.JSONField()),
                ("thresholds", models.JSONField()),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
        ),
    ]
