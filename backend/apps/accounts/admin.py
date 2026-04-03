from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import Membership, Organization, User


class MembershipInline(admin.StackedInline):
    model = Membership
    extra = 0
    can_delete = False
    fields = ["organization", "role", "has_api_key_access"]


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ["email", "first_name", "last_name", "is_staff", "get_role", "get_org"]
    search_fields = ["email", "first_name", "last_name"]
    ordering = ["email"]
    inlines = [MembershipInline]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal info", {"fields": ("first_name", "last_name", "phone")}),
        (
            "Permissions",
            {
                "fields": (
                    "is_active", "is_staff", "is_superuser", "is_verified",
                    "is_developer", "groups", "user_permissions",
                ),
            },
        ),
        ("Important dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "password1", "password2")}),
    )

    @admin.display(description="Role")
    def get_role(self, obj):
        try:
            return obj.membership.role
        except Membership.DoesNotExist:
            return "-"

    @admin.display(description="Organization")
    def get_org(self, obj):
        try:
            return obj.membership.organization.name
        except Membership.DoesNotExist:
            return "-"


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ["name", "is_active", "created_at"]
    search_fields = ["name"]


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ["user", "organization", "role", "has_api_key_access"]
    list_filter = ["role", "organization"]
    search_fields = ["user__email"]
