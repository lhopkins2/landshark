from typing import TYPE_CHECKING, Any
from uuid import UUID

from .models import AuditLog

if TYPE_CHECKING:
    from apps.accounts.models import Organization, User


def _get_org(user: "User | None") -> "Organization | None":
    """Return the user's organization or None."""
    membership = getattr(user, "membership", None)
    if membership:
        return membership.organization
    return None


def log_action(
    *,
    action: str,
    user: "User",
    document_name: str = "",
    document_id: UUID | str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    """Create an audit log entry."""
    AuditLog.objects.create(
        action=action,
        user=user,
        organization=_get_org(user),
        document_name=document_name,
        document_id=document_id,
        details=details or {},
    )
