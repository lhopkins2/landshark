# Replace FormTemplate.organization (one-org FK) with an organizations M2M so a
# template can be assigned to any number of orgs. Order matters: add the M2M,
# copy existing FK assignments into it, then drop the FK.

from django.db import migrations, models


def _copy_fk_to_m2m(apps, schema_editor):
    FormTemplate = apps.get_model("analysis", "FormTemplate")
    for template in FormTemplate.objects.exclude(organization__isnull=True).iterator():
        template.organizations.add(template.organization_id)


def _copy_m2m_to_fk(apps, schema_editor):
    # Reverse: best-effort — put the first assigned org back on the FK.
    FormTemplate = apps.get_model("analysis", "FormTemplate")
    for template in FormTemplate.objects.all():
        first = template.organizations.first()
        if first:
            template.organization_id = first.id
            template.save(update_fields=["organization"])


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0005_organization_tier'),
        ('analysis', '0016_cotanalysis_header_extracted'),
    ]

    operations = [
        migrations.AddField(
            model_name='formtemplate',
            name='organizations',
            field=models.ManyToManyField(blank=True, help_text='Orgs this template is assigned to. Org users see templates assigned to their org; a template can be assigned to any number of orgs. Managed on the Enterprise → Templates tab.', related_name='assigned_templates', to='accounts.organization'),
        ),
        migrations.RunPython(_copy_fk_to_m2m, _copy_m2m_to_fk),
        migrations.RemoveField(
            model_name='formtemplate',
            name='organization',
        ),
    ]
