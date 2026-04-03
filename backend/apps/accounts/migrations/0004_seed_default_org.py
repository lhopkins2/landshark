from django.db import migrations


def seed_default_org(apps, schema_editor):
    Organization = apps.get_model("accounts", "Organization")
    User = apps.get_model("accounts", "User")
    Membership = apps.get_model("accounts", "Membership")
    Client = apps.get_model("clients", "Client")

    org = Organization.objects.create(name="Default Organization")

    # Assign all non-developer users as admins in the default org
    for user in User.objects.filter(is_developer=False):
        Membership.objects.create(
            user=user,
            organization=org,
            role="admin",
            has_api_key_access=True,
        )

    # Assign all existing clients to the default org
    Client.objects.filter(organization__isnull=True).update(organization=org)


def reverse_seed(apps, schema_editor):
    Organization = apps.get_model("accounts", "Organization")
    Organization.objects.filter(name="Default Organization").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_organization_membership"),
        ("clients", "0002_client_organization"),
    ]

    operations = [
        migrations.RunPython(seed_default_org, reverse_seed),
    ]
