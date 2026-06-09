from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0005_application_ml_model'),
    ]

    operations = [
        migrations.RenameModel(
            old_name='Application',
            new_name='Experiment',
        ),
        migrations.AlterModelTable(
            name='experiment',
            table='api_experiment',
        ),
        migrations.AlterModelOptions(
            name='experiment',
            options={
                'verbose_name': 'Experiment',
                'verbose_name_plural': 'Experiments',
            },
        ),
        migrations.AddField(
            model_name='experiment',
            name='experiment_type',
            field=models.CharField(
                choices=[('single', 'Single'), ('compare', 'Compare')],
                default='single',
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name='experiment',
            name='results',
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='experiment',
            name='ml_model',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='experiments',
                to='api.mlmodel',
            ),
        ),
        migrations.AlterField(
            model_name='experiment',
            name='user',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='experiments',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
