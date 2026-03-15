from django.conf import settings
from django.db import models

from apps.core.models import TimestampedModel


class FormTemplate(TimestampedModel):
    """Reusable form templates for COT analysis output formatting."""

    name = models.CharField(max_length=255)
    file = models.FileField(upload_to="form_templates/%Y/%m/")
    original_filename = models.CharField(max_length=255)
    file_size = models.PositiveIntegerField(default=0)
    mime_type = models.CharField(max_length=100, blank=True, default="")
    description = models.TextField(blank=True, default="")
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
    # TODO: encrypt in production
    anthropic_api_key = models.CharField(max_length=255, blank=True, default="")
    openai_api_key = models.CharField(max_length=255, blank=True, default="")
    gemini_api_key = models.CharField(max_length=255, blank=True, default="")
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


class COTAnalysis(TimestampedModel):
    """Stores a single COT analysis run and its result."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    class ProgressStep(models.TextChoices):
        QUEUED = "queued", "Queued"
        EXTRACTING_TEXT = "extracting_text", "Extracting text"
        BUILDING_PROMPT = "building_prompt", "Building prompt"
        CALLING_AI = "calling_ai", "Calling AI"
        GENERATING_DOCUMENT = "generating_document", "Generating document"
        COMPLETE = "complete", "Complete"
        FAILED = "failed", "Failed"

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
