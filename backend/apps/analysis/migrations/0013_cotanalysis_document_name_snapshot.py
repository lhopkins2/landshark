"""Snapshot the source document filename onto COTAnalysis.

`COTAnalysis.document` is SET_NULL on delete, which previously left the review
history with no label for analyses whose source was deleted. The snapshot
preserves the original filename so the UI can still label the row and surface a
"source deleted" hint.

Backfills existing rows from `document.original_filename` when the FK is set.
"""

from django.db import migrations, models


def _backfill_snapshot(apps, schema_editor):
    COTAnalysis = apps.get_model("analysis", "COTAnalysis")
    for analysis in COTAnalysis.objects.filter(document__isnull=False).select_related("document").iterator():
        name = (analysis.document.original_filename or "")[:255]
        if name and analysis.document_name_snapshot != name:
            analysis.document_name_snapshot = name
            analysis.save(update_fields=["document_name_snapshot"])


def _noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("analysis", "0012_add_revision_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="cotanalysis",
            name="document_name_snapshot",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.RunPython(_backfill_snapshot, _noop_reverse),
    ]
