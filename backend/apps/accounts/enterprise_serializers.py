from django.db import transaction
from rest_framework import serializers

from .models import Membership, Organization, User


class EnterpriseStatsSerializer(serializers.Serializer):
    total_organizations = serializers.IntegerField()
    active_organizations = serializers.IntegerField()
    total_users = serializers.IntegerField()
    total_documents = serializers.IntegerField()
    total_analyses = serializers.IntegerField()


class EnterpriseOrgListSerializer(serializers.ModelSerializer):
    member_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Organization
        fields = ["id", "name", "is_active", "tier", "member_count", "created_at", "updated_at"]
        read_only_fields = ["id"]


class EnterpriseOrgDetailSerializer(serializers.ModelSerializer):
    member_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Organization
        fields = ["id", "name", "is_active", "tier", "member_count", "created_at", "updated_at"]
        read_only_fields = ["id"]


class EnterpriseOrgCreateSerializer(serializers.Serializer):
    """Create an organization with its initial admin user."""

    name = serializers.CharField(max_length=255)
    tier = serializers.ChoiceField(
        choices=Organization.Tier.choices,
        default=Organization.Tier.STANDARD,
        required=False,
    )
    admin_email = serializers.EmailField()
    admin_first_name = serializers.CharField(max_length=150, required=False, default="")
    admin_last_name = serializers.CharField(max_length=150, required=False, default="")
    admin_password = serializers.CharField(write_only=True, min_length=8)

    def validate_admin_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        org = Organization.objects.create(
            name=validated_data["name"],
            tier=validated_data.get("tier", Organization.Tier.STANDARD),
        )
        user = User.objects.create_user(
            email=validated_data["admin_email"],
            password=validated_data["admin_password"],
            first_name=validated_data.get("admin_first_name", ""),
            last_name=validated_data.get("admin_last_name", ""),
            is_verified=True,
        )
        Membership.objects.create(user=user, organization=org, role="admin", has_api_key_access=True)
        return org


class EnterpriseOrgMemberSerializer(serializers.Serializer):
    """Read-only serializer for org members in enterprise context."""

    id = serializers.UUIDField()
    user_id = serializers.IntegerField(source="user.id")
    email = serializers.EmailField(source="user.email")
    first_name = serializers.CharField(source="user.first_name")
    last_name = serializers.CharField(source="user.last_name")
    role = serializers.CharField()
    has_api_key_access = serializers.BooleanField()
    is_active = serializers.BooleanField(source="user.is_active")
    created_at = serializers.DateTimeField()


class EnterpriseTemplateSerializer(serializers.Serializer):
    """Read serializer for a FormTemplate in the enterprise catalog.

    Includes the list of orgs the template is assigned to (id + name), so the
    Templates tab can show assignments and filter by org.
    """

    id = serializers.UUIDField()
    name = serializers.CharField()
    original_filename = serializers.CharField()
    file_size = serializers.IntegerField()
    uploaded_by_name = serializers.SerializerMethodField()
    organizations = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField()

    def get_uploaded_by_name(self, obj) -> str | None:
        u = getattr(obj, "uploaded_by", None)
        if not u:
            return None
        return f"{u.first_name} {u.last_name}".strip() or u.email

    def get_organizations(self, obj) -> list[dict]:
        return [{"id": str(o.id), "name": o.name} for o in obj.organizations.all()]


class EnterpriseAddMemberSerializer(serializers.Serializer):
    """Add a new member to an organization (enterprise context)."""

    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=150, required=False, default="")
    last_name = serializers.CharField(max_length=150, required=False, default="")
    password = serializers.CharField(write_only=True, min_length=8)
    role = serializers.ChoiceField(choices=Membership.Role.choices)

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        org = self.context["organization"]
        user = User.objects.create_user(
            email=validated_data["email"],
            password=validated_data["password"],
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
            is_verified=True,
        )
        membership = Membership.objects.create(
            user=user,
            organization=org,
            role=validated_data["role"],
            has_api_key_access=validated_data["role"] == "admin",
        )
        return membership
