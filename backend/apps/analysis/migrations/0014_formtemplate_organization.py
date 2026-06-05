"""Org-scope FormTemplate.

Adds `organization` FK so templates can be listed by org without going through
the (fragile) `uploaded_by__membership__organization` join. Backfills existing
rows from the uploader's membership where possible; the rest stay null and
remain visible only via the admin.
"""

import django.db.models.deletion
from django.db import migrations, models


def _backfill_organization(apps, schema_editor):
    FormTemplate = apps.get_model("analysis", "FormTemplate")
    for template in FormTemplate.objects.select_related("uploaded_by").iterator():
        user = template.uploaded_by
        membership = getattr(user, "membership", None) if user else None
        if membership and membership.organization_id:
            template.organization_id = membership.organization_id
            template.save(update_fields=["organization"])


def _noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_organization_membership"),
        ("analysis", "0013_cotanalysis_document_name_snapshot"),
    ]

    operations = [
        migrations.AddField(
            model_name="formtemplate",
            name="organization",
            field=models.ForeignKey(
                blank=True,
                help_text="Owning org; null for legacy/dev templates.",
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="form_templates",
                to="accounts.organization",
            ),
        ),
        migrations.RunPython(_backfill_organization, _noop_reverse),
    ]
