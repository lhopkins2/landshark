from django.core.management.base import BaseCommand

from apps.accounts.models import User


class Command(BaseCommand):
    help = "Create a developer user (dev@landshark.dev / dev_password123)"

    def handle(self, *args, **options):
        email = "dev@landshark.dev"
        if User.objects.filter(email=email).exists():
            self.stdout.write(self.style.WARNING(f"User {email} already exists."))
            return
        User.objects.create_superuser(
            email=email,
            password="dev_password123",
            first_name="Dev",
            last_name="User",
            is_verified=True,
            is_developer=True,
        )
        self.stdout.write(self.style.SUCCESS(f"Created developer user {email}"))
