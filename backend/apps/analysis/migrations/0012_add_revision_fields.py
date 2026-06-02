"""Revision fields on COTAnalysis.

Adds a self-referential parent_analysis FK plus revision_instructions and
revision_kind so that a "re-analyze with modifiers" submission can produce a
new COTAnalysis linked to the prior one without overwriting it.
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("analysis", "0011_add_pipeline_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="cotanalysis",
            name="parent_analysis",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="revisions",
                to="analysis.cotanalysis",
            ),
        ),
        migrations.AddField(
            model_name="cotanalysis",
            name="revision_instructions",
            field=models.TextField(
                blank=True,
                default="",
                help_text="Free-form user instructions captured on a re-analyze submission.",
            ),
        ),
        migrations.AddField(
            model_name="cotanalysis",
            name="revision_kind",
            field=models.CharField(
                blank=True,
                choices=[("full_run", "Full run"), ("revision", "Revision")],
                default="full_run",
                max_length=20,
            ),
        ),
    ]
