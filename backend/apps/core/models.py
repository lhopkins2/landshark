import uuid

from django.conf import settings
from django.db import models


class TimestampedModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
        ordering = ["-created_at"]


class AuditLog(models.Model):
    class Action(models.TextChoices):
        UPLOAD = "upload", "Upload"
        UPDATE = "update", "Update"
        DELETE = "delete", "Delete"
        DOWNLOAD = "download", "Download"
        ANALYSIS_RUN = "analysis_run", "Analysis Run"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    action = models.CharField(max_length=30, choices=Action.choices)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="audit_logs")
    organization = models.ForeignKey(
        "accounts.Organization", on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_logs"
    )
    document_name = models.CharField(max_length=255, blank=True, default="")
    document_id = models.UUIDField(null=True, blank=True)
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action} by {self.user} on {self.document_name}"
