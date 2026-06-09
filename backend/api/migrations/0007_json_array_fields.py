from django.db import migrations, models


def wrap_old_records(apps, schema_editor):
    """
    Populate results with model metadata for records that have results=null.
    shap_values wrapping is handled by SQL (see database_operations).
    """
    Experiment = apps.get_model('api', 'Experiment')
    MLModel = apps.get_model('api', 'MLModel')

    for exp in Experiment.objects.filter(results__isnull=True):
        meta = {'id': None, 'name': None, 'model_type': None, 'latency_ms': None}
        if exp.ml_model_id:
            try:
                m = MLModel.objects.get(pk=exp.ml_model_id)
                meta = {'id': m.id, 'name': m.name, 'model_type': m.model_type, 'latency_ms': None}
            except MLModel.DoesNotExist:
                meta['id'] = exp.ml_model_id
        exp.results = [meta]
        exp.save(update_fields=['results'])


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0006_rename_application_to_experiment'),
    ]

    operations = [
        # Change probability (float8 → jsonb) and risk_label (varchar → jsonb) using USING clause.
        # Wrap shap_values dict in array where it's still a plain object.
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql="""
                        ALTER TABLE api_experiment
                            ALTER COLUMN probability TYPE jsonb
                            USING CASE WHEN probability IS NULL THEN NULL::jsonb
                                       ELSE jsonb_build_array(probability) END;

                        ALTER TABLE api_experiment
                            ALTER COLUMN risk_label TYPE jsonb
                            USING CASE WHEN risk_label IS NULL THEN NULL::jsonb
                                       ELSE jsonb_build_array(risk_label) END;

                        UPDATE api_experiment
                           SET shap_values = jsonb_build_array(shap_values)
                         WHERE shap_values IS NOT NULL
                           AND jsonb_typeof(shap_values) = 'object';
                    """,
                    reverse_sql=migrations.RunSQL.noop,
                ),
            ],
            state_operations=[
                migrations.AlterField(
                    model_name='experiment',
                    name='probability',
                    field=models.JSONField(blank=True, null=True),
                ),
                migrations.AlterField(
                    model_name='experiment',
                    name='risk_label',
                    field=models.JSONField(blank=True, null=True),
                ),
            ],
        ),
        # Populate results for old records that have results=null
        migrations.RunPython(wrap_old_records, reverse_code=migrations.RunPython.noop),
    ]
