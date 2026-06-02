from typing import TYPE_CHECKING, Any

from django.db.models import QuerySet

if TYPE_CHECKING:
    from .models import Organization, User

_NO_ORG = object()  # sentinel: user has no org (should see nothing)


def get_user_organization(user: "User") -> "Organization | None":
    """Return the user's organization, or None if they have no membership."""
    from .models import Membership
    try:
        return user.membership.organization
    except Membership.DoesNotExist:
        return None


class OrgScopedViewMixin:
    """Mixin that filters querysets to the user's organization."""

    org_field: str = "organization"

    def get_org(self) -> Any:
        """Return the request user's organization, None for developers, or _NO_ORG sentinel."""
        user = self.request.user  # type: ignore[attr-defined]
        if getattr(user, "is_developer", False):
            return None  # developers see everything
        membership = getattr(user, "membership", None)
        if membership:
            return membership.organization
        return _NO_ORG  # no membership — must see nothing

    def get_queryset(self) -> QuerySet:
        qs = super().get_queryset()  # type: ignore[misc]
        org = self.get_org()
        if org is None:
            return qs  # developer bypass
        if org is _NO_ORG:
            return qs.none()
        return qs.filter(**{self.org_field: org})
