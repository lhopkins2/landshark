from rest_framework.permissions import BasePermission


class IsOrgAdmin(BasePermission):
    """Allows access to org admins and developers."""

    def has_permission(self, request, view):
        if getattr(request.user, "is_developer", False):
            return True
        membership = getattr(request.user, "membership", None)
        if membership is None:
            return False
        return membership.role == "admin"


class IsOrgMember(BasePermission):
    """Allows access to any org member (admin or operator) and developers."""

    def has_permission(self, request, view):
        if getattr(request.user, "is_developer", False):
            return True
        return hasattr(request.user, "membership")


class HasApiKeyAccess(BasePermission):
    """Allows access if user is admin, developer, or operator with has_api_key_access."""

    def has_permission(self, request, view):
        if getattr(request.user, "is_developer", False):
            return True
        membership = getattr(request.user, "membership", None)
        if membership is None:
            return False
        if membership.role == "admin":
            return True
        return membership.has_api_key_access
