from typing import Any

from rest_framework import serializers

from .models import COTAnalysis, FormTemplate, OrganizationSettings, UserSettings


class FormTemplateSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = FormTemplate
        fields = [
            "id",
            "name",
            "original_filename",
            "file_size",
            "mime_type",
            "description",
            "custom_prompt",
            "uploaded_by",
            "uploaded_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "uploaded_by", "file_size", "mime_type", "original_filename"]

    def get_uploaded_by_name(self, obj: FormTemplate) -> str | None:
        if obj.uploaded_by:
            return f"{obj.uploaded_by.first_name} {obj.uploaded_by.last_name}".strip() or obj.uploaded_by.email
        return None


class FormTemplateUploadSerializer(serializers.ModelSerializer):
    file = serializers.FileField(write_only=True)

    class Meta:
        model = FormTemplate
        fields = ["file", "name", "description", "custom_prompt"]

    def validate_file(self, value: Any) -> Any:
        allowed = [
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ]
        if value.content_type not in allowed:
            raise serializers.ValidationError("Only DOCX files are allowed.")
        return value

    def create(self, validated_data: dict[str, Any]) -> FormTemplate:
        uploaded_file = validated_data["file"]
        validated_data["original_filename"] = uploaded_file.name
        validated_data["file_size"] = uploaded_file.size
        validated_data["mime_type"] = uploaded_file.content_type or ""
        validated_data["uploaded_by"] = self.context["request"].user
        return super().create(validated_data)


class _APIKeySettingsSerializer(serializers.ModelSerializer):
    """Base serializer for models with API key fields and provider/model defaults."""

    anthropic_api_key_display = serializers.SerializerMethodField()
    openai_api_key_display = serializers.SerializerMethodField()
    gemini_api_key_display = serializers.SerializerMethodField()

    _KEY_FIELDS = ["anthropic_api_key", "openai_api_key", "gemini_api_key"]

    def _mask_key(self, key: str) -> str:
        if not key:
            return ""
        return "\u2022" * 8 + key[-4:]

    def get_anthropic_api_key_display(self, obj: UserSettings | OrganizationSettings) -> str:
        return self._mask_key(obj.anthropic_api_key)

    def get_openai_api_key_display(self, obj: UserSettings | OrganizationSettings) -> str:
        return self._mask_key(obj.openai_api_key)

    def get_gemini_api_key_display(self, obj: UserSettings | OrganizationSettings) -> str:
        return self._mask_key(obj.gemini_api_key)

    # Sentinel "CLEAR" explicitly wipes a stored key; blank/missing values are ignored
    # so a partial form submission doesn't accidentally clear other keys.
    CLEAR_KEY = "CLEAR"

    def update(
        self,
        instance: UserSettings | OrganizationSettings,
        validated_data: dict[str, Any],
    ) -> UserSettings | OrganizationSettings:
        for key_field in self._KEY_FIELDS:
            value = validated_data.get(key_field)
            if value is None or value == "":
                continue
            if value == self.CLEAR_KEY:
                setattr(instance, key_field, "")
            else:
                setattr(instance, key_field, value)
        if "default_provider" in validated_data:
            instance.default_provider = validated_data["default_provider"]
        if "default_model" in validated_data:
            instance.default_model = validated_data["default_model"]
        instance.save()
        return instance


class UserSettingsSerializer(_APIKeySettingsSerializer):
    class Meta:
        model = UserSettings
        fields = [
            "id",
            "default_provider",
            "default_model",
            "anthropic_api_key",
            "openai_api_key",
            "gemini_api_key",
            "anthropic_api_key_display",
            "openai_api_key_display",
            "gemini_api_key_display",
            "updated_at",
        ]
        extra_kwargs = {
            "anthropic_api_key": {"write_only": True, "required": False},
            "openai_api_key": {"write_only": True, "required": False},
            "gemini_api_key": {"write_only": True, "required": False},
        }


class OrganizationSettingsSerializer(_APIKeySettingsSerializer):
    class Meta:
        model = OrganizationSettings
        fields = [
            "id",
            "default_provider",
            "default_model",
            "anthropic_api_key",
            "openai_api_key",
            "gemini_api_key",
            "anthropic_api_key_display",
            "openai_api_key_display",
            "gemini_api_key_display",
            "updated_at",
        ]
        extra_kwargs = {
            "anthropic_api_key": {"write_only": True, "required": False},
            "openai_api_key": {"write_only": True, "required": False},
            "gemini_api_key": {"write_only": True, "required": False},
        }


class COTAnalysisSerializer(serializers.ModelSerializer):
    document_name = serializers.SerializerMethodField()
    document_deleted = serializers.SerializerMethodField()
    form_template_name = serializers.SerializerMethodField()
    generated_document_name = serializers.SerializerMethodField()
    generated_document_url = serializers.SerializerMethodField()
    revisions = serializers.SerializerMethodField()

    class Meta:
        model = COTAnalysis
        fields = [
            "id",
            "document",
            "document_name",
            "document_deleted",
            "form_template",
            "form_template_name",
            "analysis_order",
            "output_format",
            "status",
            "ai_provider",
            "ai_model",
            "result_text",
            "error_message",
            "generated_document",
            "generated_document_name",
            "generated_document_url",
            "progress_step",
            "pipeline_version",
            "parsed_documents",
            "chain_events",
            "narrative",
            "notes",
            "failed_pages_count",
            "parent_analysis",
            "revision_instructions",
            "revision_kind",
            "revisions",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "progress_step",
            "ai_provider",
            "ai_model",
            "result_text",
            "error_message",
            "generated_document",
            "pipeline_version",
            "parsed_documents",
            "chain_events",
            "narrative",
            "notes",
            "failed_pages_count",
            "parent_analysis",
            "revision_instructions",
            "revision_kind",
            "revisions",
            "created_by",
        ]

    def get_revisions(self, obj: COTAnalysis) -> list[dict[str, str]]:
        """Return child revisions of this analysis (newest first)."""
        return [
            {
                "id": str(r.id),
                "created_at": r.created_at.isoformat(),
                "revision_instructions": r.revision_instructions or "",
                "status": r.status,
            }
            for r in obj.revisions.order_by("-created_at")
        ]

    def get_document_name(self, obj: COTAnalysis) -> str | None:
        if obj.document:
            return obj.document.original_filename
        # Fall back to the snapshot so the review history can still label
        # analyses whose source Document has been deleted.
        return obj.document_name_snapshot or None

    def get_document_deleted(self, obj: COTAnalysis) -> bool:
        """True when the source Document was deleted after this analysis ran."""
        return obj.document_id is None and bool(obj.document_name_snapshot)

    def get_form_template_name(self, obj: COTAnalysis) -> str | None:
        return obj.form_template.name if obj.form_template else None

    def get_generated_document_name(self, obj: COTAnalysis) -> str | None:
        return obj.generated_document.original_filename if obj.generated_document else None

    def get_generated_document_url(self, obj: COTAnalysis) -> str | None:
        if obj.generated_document and obj.generated_document.file:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.generated_document.file.url)
            return obj.generated_document.file.url
        return None


class RunAnalysisSerializer(serializers.Serializer):
    """Input serializer for the analyze endpoint."""

    document_id = serializers.UUIDField()
    analysis_order = serializers.ChoiceField(
        choices=COTAnalysis.AnalysisOrder.choices,
        default="chronological",
    )
    output_format = serializers.ChoiceField(
        choices=COTAnalysis.OutputFormat.choices,
        default="pdf",
    )
    legal_description = serializers.CharField(required=False, allow_blank=True, default="")
    provider = serializers.CharField(required=False, allow_blank=True, default="")
    model = serializers.CharField(required=False, allow_blank=True, default="")


class COTAnalysisDebugSerializer(COTAnalysisSerializer):
    """Extended serializer with debug fields for developer users."""

    class Meta(COTAnalysisSerializer.Meta):
        fields = COTAnalysisSerializer.Meta.fields + ["prompt_text"]


class ReanalyzeInstrumentEditSerializer(serializers.Serializer):
    """One entry in `instrument_edits`: replaces the instrument at `index` with the provided JSON."""

    index = serializers.IntegerField(min_value=0)
    instrument = serializers.JSONField()


class ReanalyzeSerializer(serializers.Serializer):
    """Input for POST /analysis/<id>/reanalyze/."""

    instrument_edits = ReanalyzeInstrumentEditSerializer(many=True, required=False, default=list)
    pages_to_rescan = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        default=list,
    )
    user_instructions = serializers.CharField(required=False, allow_blank=True, default="")
    provider = serializers.CharField(required=False, allow_blank=True, default="")
    model = serializers.CharField(required=False, allow_blank=True, default="")
    output_format = serializers.ChoiceField(
        choices=COTAnalysis.OutputFormat.choices,
        required=False,
        default="pdf",
    )
