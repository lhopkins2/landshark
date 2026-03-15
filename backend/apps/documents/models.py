from django.conf import settings
from django.db import models

from apps.core.models import TimestampedModel


class Document(TimestampedModel):
    chain_of_title = models.ForeignKey(
        "clients.ChainOfTitle",
        on_delete=models.CASCADE,
        related_name="documents",
        null=True,
        blank=True,
    )
    file = models.FileField(upload_to="documents/%Y/%m/")
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
