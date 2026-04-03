from datetime import datetime

from django.conf import settings
from django.db import models
from encrypted_model_fields.fields import EncryptedCharField

from apps.core.models import TimestampedModel


def _template_upload_path(instance, filename):
    """Store form templates under org-{uuid}/form_templates/YYYY/MM/."""
    if instance.uploaded_by:
        membership = getattr(instance.uploaded_by, "membership", None)
        org_id = str(membership.organization_id) if membership else "unassigned"
    else:
        org_id = "unassigned"
    return f"org-{org_id}/form_templates/{datetime.now():%Y/%m}/{filename}"


class FormTemplate(TimestampedModel):
    """Reusable form templates for COT analysis output formatting."""

    name = models.CharField(max_length=255)
    file = models.FileField(upload_to=_template_upload_path)
    original_filename = models.CharField(max_length=255)
    file_size = models.PositiveIntegerField(default=0)
    mime_type = models.CharField(max_length=100, blank=True, default="")
    description = models.TextField(blank=True, default="")
    custom_prompt = models.TextField(
        blank=True,
        default="",
        help_text="Custom instructions for the AI when using this template. "
        "Overrides the default form template instructions section of the prompt.",
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="form_templates",
    )

    class Meta(TimestampedModel.Meta):
        pass

    def __str__(self):
        return self.name


class UserSettings(TimestampedModel):
    """Per-user settings for API keys and preferences."""

    class AIProvider(models.TextChoices):
        ANTHROPIC = "anthropic", "Anthropic (Claude)"
        OPENAI = "openai", "OpenAI (GPT)"
        GEMINI = "gemini", "Google (Gemini)"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="analysis_settings",
    )
    anthropic_api_key = EncryptedCharField(max_length=500, blank=True, default="")
    openai_api_key = EncryptedCharField(max_length=500, blank=True, default="")
    gemini_api_key = EncryptedCharField(max_length=500, blank=True, default="")
    default_provider = models.CharField(
        max_length=20,
        choices=AIProvider.choices,
        default=AIProvider.ANTHROPIC,
    )
    default_model = models.CharField(max_length=100, blank=True, default="")

    class Meta(TimestampedModel.Meta):
        verbose_name_plural = "user settings"

    def __str__(self):
        return f"Settings for {self.user.email}"


class OrganizationSettings(TimestampedModel):
    """Per-organization settings for shared API keys and preferences."""

    organization = models.OneToOneField(
        "accounts.Organization",
        on_delete=models.CASCADE,
        related_name="analysis_settings",
    )
    anthropic_api_key = EncryptedCharField(max_length=500, blank=True, default="")
    openai_api_key = EncryptedCharField(max_length=500, blank=True, default="")
    gemini_api_key = EncryptedCharField(max_length=500, blank=True, default="")
    default_provider = models.CharField(
        max_length=20,
        choices=UserSettings.AIProvider.choices,
        default=UserSettings.AIProvider.ANTHROPIC,
    )
    default_model = models.CharField(max_length=100, blank=True, default="")

    class Meta(TimestampedModel.Meta):
        verbose_name_plural = "organization settings"

    def __str__(self):
        return f"Settings for {self.organization.name}"


class COTAnalysis(TimestampedModel):
    """Stores a single COT analysis run and its result."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"
        CANCELLED = "cancelled", "Cancelled"

    class ProgressStep(models.TextChoices):
        QUEUED = "queued", "Queued"
        EXTRACTING_TEXT = "extracting_text", "Extracting text"
        BUILDING_PROMPT = "building_prompt", "Building prompt"
        CALLING_AI = "calling_ai", "Calling AI"
        GENERATING_DOCUMENT = "generating_document", "Generating document"
        COMPLETE = "complete", "Complete"
        FAILED = "failed", "Failed"
        CANCELLED = "cancelled", "Cancelled"

    class AnalysisOrder(models.TextChoices):
        CHRONOLOGICAL = "chronological", "Chronological Order"
        REVERSE_CHRONOLOGICAL = "reverse_chronological", "Reverse Chronological Order"

    class OutputFormat(models.TextChoices):
        PDF = "pdf", "PDF"
        DOCX = "docx", "Word Document"

    document = models.ForeignKey(
        "documents.Document",
        on_delete=models.SET_NULL,
        null=True,
        related_name="analyses",
    )
    form_template = models.ForeignKey(
        FormTemplate,
        on_delete=models.SET_NULL,
        null=True,
        related_name="analyses",
    )
    analysis_order = models.CharField(
        max_length=30,
        choices=AnalysisOrder.choices,
        default=AnalysisOrder.CHRONOLOGICAL,
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    progress_step = models.CharField(
        max_length=30,
        choices=ProgressStep.choices,
        default=ProgressStep.QUEUED,
        blank=True,
    )
    ai_provider = models.CharField(max_length=20, blank=True, default="")
    ai_model = models.CharField(max_length=100, blank=True, default="")
    output_format = models.CharField(
        max_length=10,
        choices=OutputFormat.choices,
        default=OutputFormat.PDF,
    )
    result_text = models.TextField(blank=True, default="")
    prompt_text = models.TextField(
        blank=True, default="", help_text="Full prompt sent to the AI (text portions only, for debugging)."
    )
    error_message = models.TextField(blank=True, default="")
    generated_document = models.ForeignKey(
        "documents.Document",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="generated_from_analysis",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="cot_analyses",
    )

    class Meta(TimestampedModel.Meta):
        verbose_name = "COT analysis"
        verbose_name_plural = "COT analyses"

    def __str__(self):
        return f"Analysis {self.id} - {self.status}"
