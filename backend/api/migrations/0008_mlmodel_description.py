from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0007_json_array_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='mlmodel',
            name='description',
            field=models.TextField(blank=True, default=''),
        ),
    ]
