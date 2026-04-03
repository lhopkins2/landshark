from django.contrib.auth.models import AbstractUser
from django.db import models

from apps.core.models import TimestampedModel

from .managers import UserManager


class Organization(TimestampedModel):
    name = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)

    class Meta(TimestampedModel.Meta):
        pass

    def __str__(self):
        return self.name


class User(AbstractUser):
    username = None
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, blank=True, default="")
    is_verified = models.BooleanField(default=False)
    is_developer = models.BooleanField(default=False)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        ordering = ["email"]

    def __str__(self):
        return self.email


class Membership(TimestampedModel):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        OPERATOR = "operator", "Operator"

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="membership",
    )
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    role = models.CharField(max_length=20, choices=Role.choices)
    has_api_key_access = models.BooleanField(default=False)

    class Meta(TimestampedModel.Meta):
        constraints = [
            models.UniqueConstraint(fields=["user"], name="unique_user_membership"),
        ]

    def __str__(self):
        return f"{self.user.email} - {self.role} @ {self.organization.name}"
