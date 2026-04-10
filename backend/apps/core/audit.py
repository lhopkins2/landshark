from .models import AuditLog


def _get_org(user):
    """Return the user's organization or None."""
    membership = getattr(user, "membership", None)
    if membership:
        return membership.organization
    return None


def log_action(*, action, user, document_name="", document_id=None, details=None):
    """Create an audit log entry."""
    AuditLog.objects.create(
        action=action,
        user=user,
        organization=_get_org(user),
        document_name=document_name,
        document_id=document_id,
        details=details or {},
    )
