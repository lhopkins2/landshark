import logging

from django.conf import settings
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.utils import timezone
from encrypted_model_fields.fields import EncryptedCharField

from apps.core.models import TimestampedModel

logger = logging.getLogger(__name__)


def _template_upload_path(instance: "FormTemplate", filename: str) -> str:
    """Store form templates under org-{uuid}/form_templates/YYYY/MM/."""
    if instance.uploaded_by:
        membership = getattr(instance.uploaded_by, "membership", None)
        org_id = str(membership.organization_id) if membership else "unassigned"
    else:
        org_id = "unassigned"
    return f"org-{org_id}/form_templates/{timezone.now():%Y/%m}/{filename}"


class FormTemplate(TimestampedModel):
    """Reusable form templates for COT analysis output formatting.

    Templates are DOCX files using docxtpl/Jinja2 placeholders. They're
    org-scoped — every org member sees the same library.
    """

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
    organizations = models.ManyToManyField(
        "accounts.Organization",
        related_name="assigned_templates",
        blank=True,
        help_text="Orgs this template is assigned to. Org users see templates assigned to their org; "
        "a template can be assigned to any number of orgs. Managed on the Enterprise → Templates tab.",
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="form_templates",
    )

    class Meta(TimestampedModel.Meta):
        pass

    def __str__(self) -> str:
        return self.name


@receiver(post_delete, sender=FormTemplate)
def _delete_form_template_file(sender, instance: FormTemplate, **kwargs) -> None:
    """Remove the underlying DOCX from storage when a FormTemplate row is deleted.

    Django's FileField doesn't delete files on row deletion by default. Mirrors
    the Document cleanup signal in apps/documents/models.py.
    """
    if not instance.file:
        return
    try:
        instance.file.delete(save=False)
    except Exception:
        logger.warning("Failed to delete file for FormTemplate %s from storage", instance.pk, exc_info=True)


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

    def __str__(self) -> str:
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
    # When True, every member of the org (operators AND admins) uses this org's
    # API key + model for analyses; personal keys/models are ignored. When False,
    # the per-member rule applies (admins and operators with has_api_key_access
    # may use their own keys, falling back to the org's). See views.resolve_api_config.
    lock_member_api_keys = models.BooleanField(default=False)

    class Meta(TimestampedModel.Meta):
        verbose_name_plural = "organization settings"

    def __str__(self) -> str:
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
    # Snapshot of the source filename at creation time. Survives deletion of the
    # underlying Document (FK is SET_NULL) so the review history can still label
    # the row and flag it as "source deleted".
    document_name_snapshot = models.CharField(max_length=255, blank=True, default="")
    # Operator-entered report-header values (tax_id, tract_number, record_owner,
    # address, acres, title_agent, legal_description). Prefilled from the chain/
    # document on the Analyze form, editable per run. Empty dict = legacy/no override,
    # in which case renderers fall back to the saved records. See services/header.py.
    header_fields = models.JSONField(default=dict, blank=True)
    # AI-extracted header values (tax_id, record_owner, address, acres) pulled from
    # the analyzed instruments during the pipeline. Used to fill header fields the
    # operator left blank. Operator entries always win over these. See services/header_extract.py.
    header_extracted = models.JSONField(default=dict, blank=True)
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
    input_tokens = models.PositiveIntegerField(default=0, help_text="Number of input/prompt tokens consumed.")
    output_tokens = models.PositiveIntegerField(default=0, help_text="Number of output/completion tokens consumed.")
    result_text = models.TextField(blank=True, default="")
    prompt_text = models.TextField(
        blank=True, default="", help_text="Full prompt sent to the AI (text portions only, for debugging)."
    )
    error_message = models.TextField(blank=True, default="")
    # Two-stage pipeline output. `pipeline_version` is empty on historical rows
    # that pre-date the structured pipeline; populated ("v1", ...) on every new run.
    pipeline_version = models.CharField(max_length=20, blank=True, default="")
    parsed_documents = models.JSONField(blank=True, null=True, default=None)
    chain_events = models.JSONField(blank=True, null=True, default=None)
    narrative = models.TextField(blank=True, default="")
    notes = models.JSONField(blank=True, null=True, default=None)
    failed_pages_count = models.PositiveIntegerField(default=0)
    # Re-analyze creates a child analysis pointing back at the original; null on the first run.
    parent_analysis = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="revisions",
    )
    revision_instructions = models.TextField(
        blank=True,
        default="",
        help_text="Free-form user instructions captured on a re-analyze submission.",
    )

    class RevisionKind(models.TextChoices):
        FULL_RUN = "full_run", "Full run"
        REVISION = "revision", "Revision"

    revision_kind = models.CharField(
        max_length=20,
        choices=RevisionKind.choices,
        default=RevisionKind.FULL_RUN,
        blank=True,
    )
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

    def __str__(self) -> str:
        return f"Analysis {self.id} - {self.status}"
