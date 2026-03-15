from django.core.management.base import BaseCommand

from apps.accounts.models import User


class Command(BaseCommand):
    help = "Create a dev superuser (admin@landshark.dev / devpassword123)"

    def handle(self, *args, **options):
        email = "admin@landshark.dev"
        if User.objects.filter(email=email).exists():
            self.stdout.write(self.style.WARNING(f"User {email} already exists."))
            return
        User.objects.create_superuser(
            email=email,
            password="devpassword123",
            first_name="Admin",
            last_name="User",
            is_verified=True,
        )
        self.stdout.write(self.style.SUCCESS(f"Created superuser {email}"))
