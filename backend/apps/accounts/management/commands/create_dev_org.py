from django.core.management.base import BaseCommand

from apps.accounts.models import Membership, Organization, User


class Command(BaseCommand):
    help = "Create a dev organization with admin and operator accounts for testing."

    def handle(self, *args, **options):
        org, created = Organization.objects.get_or_create(
            name="Dev Organization",
            defaults={"is_active": True},
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f"Created organization: {org.name}"))
        else:
            self.stdout.write(f"Organization '{org.name}' already exists.")

        # Admin user
        admin_email = "orgadmin@landshark.dev"
        admin_user, admin_created = User.objects.get_or_create(
            email=admin_email,
            defaults={
                "first_name": "Org",
                "last_name": "Admin",
                "is_verified": True,
                "is_staff": True,
            },
        )
        if admin_created:
            admin_user.set_password("devpassword123")
            admin_user.save()
            self.stdout.write(self.style.SUCCESS(f"Created admin user: {admin_email}"))
        else:
            self.stdout.write(f"User '{admin_email}' already exists.")

        Membership.objects.get_or_create(
            user=admin_user,
            defaults={
                "organization": org,
                "role": Membership.Role.ADMIN,
                "has_api_key_access": True,
            },
        )

        # Operator user
        op_email = "operator@landshark.dev"
        op_user, op_created = User.objects.get_or_create(
            email=op_email,
            defaults={
                "first_name": "Test",
                "last_name": "Operator",
                "is_verified": True,
            },
        )
        if op_created:
            op_user.set_password("devpassword123")
            op_user.save()
            self.stdout.write(self.style.SUCCESS(f"Created operator user: {op_email}"))
        else:
            self.stdout.write(f"User '{op_email}' already exists.")

        Membership.objects.get_or_create(
            user=op_user,
            defaults={
                "organization": org,
                "role": Membership.Role.OPERATOR,
                "has_api_key_access": False,
            },
        )

        self.stdout.write(self.style.SUCCESS("Dev organization setup complete."))
        self.stdout.write(f"  Admin:    {admin_email} / devpassword123")
        self.stdout.write(f"  Operator: {op_email} / devpassword123")
