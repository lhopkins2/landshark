import logging
from typing import TYPE_CHECKING

from django.conf import settings
from django.db import models
from django.db.models import Q, QuerySet
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.utils import timezone

from apps.core.models import TimestampedModel

if TYPE_CHECKING:
    from apps.accounts.models import User

logger = logging.getLogger(__name__)


def _get_org_id(user: "User") -> str:
    """Return the user's organization UUID, or 'unassigned'."""
    membership = getattr(user, "membership", None)
    if membership:
        return str(membership.organization_id)
    return "unassigned"


def document_upload_path(instance: "Document", filename: str) -> str:
    """Store documents under org-{uuid}/documents/YYYY/MM/."""
    if instance.chain_of_title:
        org_id = str(instance.chain_of_title.project.client.organization_id)
    elif instance.uploaded_by:
        org_id = _get_org_id(instance.uploaded_by)
    else:
        org_id = "unassigned"
    return f"org-{org_id}/documents/{timezone.now():%Y/%m}/{filename}"


class DocumentFolder(TimestampedModel):
    """Optional folder for organizing documents."""

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    organization = models.ForeignKey(
        "accounts.Organization",
        on_delete=models.CASCADE,
        related_name="document_folders",
        null=True,
        blank=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="document_folders",
    )

    class Meta(TimestampedModel.Meta):
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Document(TimestampedModel):
    chain_of_title = models.ForeignKey(
        "clients.ChainOfTitle",
        on_delete=models.CASCADE,
        related_name="documents",
        null=True,
        blank=True,
    )
    folder = models.ForeignKey(
        DocumentFolder,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="documents",
    )
    file = models.FileField(upload_to=document_upload_path, max_length=500)
    original_filename = models.CharField(max_length=255)
    file_size = models.PositiveIntegerField(default=0)
    mime_type = models.CharField(max_length=100, blank=True, default="")
    tract_number = models.CharField(max_length=100, blank=True, default="")
    last_record_holder = models.CharField(max_length=255, blank=True, default="")
    description = models.TextField(blank=True, default="")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="uploaded_documents",
    )

    class Meta(TimestampedModel.Meta):
        pass

    def __str__(self) -> str:
        return self.original_filename


def org_scoped_documents(
    user: "User", base_qs: QuerySet["Document"] | None = None
) -> QuerySet["Document"]:
    """Return a Document queryset scoped to the user's organization.

    Developers see everything. Users with no membership see nothing.
    Everyone else sees documents whose chain-of-title belongs to their org,
    plus unassigned documents uploaded by a member of their org.
    """
    if base_qs is None:
        base_qs = Document.objects.all()
    if getattr(user, "is_developer", False):
        return base_qs
    membership = getattr(user, "membership", None)
    if not membership:
        return base_qs.none()
    org = membership.organization
    return base_qs.filter(
        Q(chain_of_title__project__client__organization=org)
        | Q(chain_of_title__isnull=True, uploaded_by__membership__organization=org)
    )


@receiver(post_delete, sender=Document)
def _delete_document_file_from_storage(sender, instance: Document, **kwargs) -> None:
    """Remove the underlying file from storage when a Document row is deleted.

    Django's FileField does NOT delete files on row deletion by default,
    leaving orphans in MEDIA_ROOT (or S3). Fires on direct deletes and cascades alike.
    """
    if not instance.file:
        return
    try:
        instance.file.delete(save=False)
    except Exception:
        # A missing file or transient storage hiccup shouldn't block the DB delete.
        logger.warning("Failed to delete file for Document %s from storage", instance.pk, exc_info=True)
