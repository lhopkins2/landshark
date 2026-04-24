from rest_framework.permissions import BasePermission


def _get_active_membership(user):
    """Return the user's membership if their org is active, else None."""
    membership = getattr(user, "membership", None)
    if membership is None:
        return None
    if not membership.organization.is_active:
        return None
    return membership


class IsOrgAdmin(BasePermission):
    """Allows access to org admins (in active orgs) and developers."""

    def has_permission(self, request, view):
        if getattr(request.user, "is_developer", False):
            return True
        membership = _get_active_membership(request.user)
        if membership is None:
            return False
        return membership.role == "admin"


class IsEnterprise(BasePermission):
    """Allows access only to users with is_developer=True."""

    def has_permission(self, request, view):
        return getattr(request.user, "is_developer", False)


class HasApiKeyAccess(BasePermission):
    """Allows access if user is admin, developer, or operator with has_api_key_access (in active org)."""

    def has_permission(self, request, view):
        if getattr(request.user, "is_developer", False):
            return True
        membership = _get_active_membership(request.user)
        if membership is None:
            return False
        if membership.role == "admin":
            return True
        return membership.has_api_key_access
