from django.contrib.auth import authenticate
from django.db import transaction
from rest_framework import serializers

from .models import Membership, User


class UserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    organization_id = serializers.SerializerMethodField()
    organization_name = serializers.SerializerMethodField()
    has_api_key_access = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "email", "first_name", "last_name", "phone",
            "is_verified", "is_developer",
            "role", "organization_id", "organization_name", "has_api_key_access",
        ]
        read_only_fields = ["id", "email", "is_verified"]

    def _get_membership(self, obj):
        # Cache on the instance to avoid repeated DB hits per serializer method
        cache_attr = "_cached_membership"
        if not hasattr(obj, cache_attr):
            try:
                setattr(obj, cache_attr, obj.membership)
            except Membership.DoesNotExist:
                setattr(obj, cache_attr, None)
        return getattr(obj, cache_attr)

    def get_role(self, obj):
        m = self._get_membership(obj)
        return m.role if m else None

    def get_organization_id(self, obj):
        m = self._get_membership(obj)
        return str(m.organization_id) if m else None

    def get_organization_name(self, obj):
        m = self._get_membership(obj)
        return m.organization.name if m else None

    def get_has_api_key_access(self, obj):
        if obj.is_developer:
            return True
        m = self._get_membership(obj)
        if m is None:
            return False
        if m.role == "admin":
            return True
        return m.has_api_key_access


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        request = self.context.get("request")
        user = authenticate(request=request, email=attrs["email"], password=attrs["password"])
        if not user:
            raise serializers.ValidationError("Invalid email or password.")
        if not user.is_verified:
            raise serializers.ValidationError("Your account has not been verified yet.")
        attrs["user"] = user
        return attrs


class MemberSerializer(serializers.Serializer):
    """Read-only serializer for listing org members."""

    id = serializers.UUIDField()
    user_id = serializers.IntegerField(source="user.id")
    email = serializers.EmailField(source="user.email")
    first_name = serializers.CharField(source="user.first_name")
    last_name = serializers.CharField(source="user.last_name")
    role = serializers.CharField()
    has_api_key_access = serializers.BooleanField()
    is_active = serializers.BooleanField(source="user.is_active")
    created_at = serializers.DateTimeField()


class CreateMemberSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=150, required=False, default="")
    last_name = serializers.CharField(max_length=150, required=False, default="")
    password = serializers.CharField(write_only=True, min_length=8)
    role = serializers.ChoiceField(choices=Membership.Role.choices)
    has_api_key_access = serializers.BooleanField(default=False)

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate(self, attrs):
        # Admins always have API key access
        if attrs["role"] == "admin":
            attrs["has_api_key_access"] = True
        return attrs

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
            has_api_key_access=validated_data["has_api_key_access"],
        )
        return membership


class UpdateMemberSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=Membership.Role.choices, required=False)
    has_api_key_access = serializers.BooleanField(required=False)
    is_active = serializers.BooleanField(required=False)

    @transaction.atomic
    def update(self, membership, validated_data):
        if "role" in validated_data:
            membership.role = validated_data["role"]
            # Admins always have API key access
            if validated_data["role"] == "admin":
                membership.has_api_key_access = True
        if "has_api_key_access" in validated_data and membership.role != "admin":
            membership.has_api_key_access = validated_data["has_api_key_access"]
        membership.save()

        if "is_active" in validated_data:
            membership.user.is_active = validated_data["is_active"]
            membership.user.save(update_fields=["is_active"])

        return membership
