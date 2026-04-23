from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import TimestampedModel


def _get_org_id(user):
    """Return the user's organization UUID, or 'unassigned'."""
    membership = getattr(user, "membership", None)
    if membership:
        return str(membership.organization_id)
    return "unassigned"


def document_upload_path(instance, filename):
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

    def __str__(self):
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

    def __str__(self):
        return self.original_filename
