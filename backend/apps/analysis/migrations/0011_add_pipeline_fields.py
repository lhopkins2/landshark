"""New-pipeline fields on COTAnalysis.

These are all optional. The legacy single-prompt path leaves them empty and behaves
as before. When USE_NEW_PIPELINE is on, the two-stage pipeline populates them with
structured Stage 1/Stage 2 output for richer UI rendering.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("analysis", "0010_add_token_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="cotanalysis",
            name="pipeline_version",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
        migrations.AddField(
            model_name="cotanalysis",
            name="parsed_documents",
            field=models.JSONField(blank=True, default=None, null=True),
        ),
        migrations.AddField(
            model_name="cotanalysis",
            name="chain_events",
            field=models.JSONField(blank=True, default=None, null=True),
        ),
        migrations.AddField(
            model_name="cotanalysis",
            name="narrative",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="cotanalysis",
            name="notes",
            field=models.JSONField(blank=True, default=None, null=True),
        ),
        migrations.AddField(
            model_name="cotanalysis",
            name="failed_pages_count",
            field=models.PositiveIntegerField(default=0),
        ),
    ]
