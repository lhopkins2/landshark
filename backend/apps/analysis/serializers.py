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

    def get_uploaded_by_name(self, obj):
        if obj.uploaded_by:
            return f"{obj.uploaded_by.first_name} {obj.uploaded_by.last_name}".strip() or obj.uploaded_by.email
        return None


class FormTemplateUploadSerializer(serializers.ModelSerializer):
    file = serializers.FileField(write_only=True)

    class Meta:
        model = FormTemplate
        fields = ["file", "name", "description", "custom_prompt"]

    def validate_file(self, value):
        allowed = [
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ]
        if value.content_type not in allowed:
            raise serializers.ValidationError("Only DOCX files are allowed.")
        return value

    def create(self, validated_data):
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

    def _mask_key(self, key):
        if not key:
            return ""
        return "\u2022" * 8 + key[-4:]

    def get_anthropic_api_key_display(self, obj):
        return self._mask_key(obj.anthropic_api_key)

    def get_openai_api_key_display(self, obj):
        return self._mask_key(obj.openai_api_key)

    def get_gemini_api_key_display(self, obj):
        return self._mask_key(obj.gemini_api_key)

    # Sentinel value to explicitly clear an API key (empty string is ignored
    # to avoid accidental clears from form submissions that omit the field).
    CLEAR_KEY = "CLEAR"

    def update(self, instance, validated_data):
        for key_field in self._KEY_FIELDS:
            value = validated_data.get(key_field)
            if value is None or value == "":
                continue  # field not submitted or blank — no change
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
    form_template_name = serializers.SerializerMethodField()
    generated_document_name = serializers.SerializerMethodField()
    generated_document_url = serializers.SerializerMethodField()

    class Meta:
        model = COTAnalysis
        fields = [
            "id",
            "document",
            "document_name",
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
            "created_by",
        ]

    def get_document_name(self, obj):
        return obj.document.original_filename if obj.document else None

    def get_form_template_name(self, obj):
        return obj.form_template.name if obj.form_template else None

    def get_generated_document_name(self, obj):
        return obj.generated_document.original_filename if obj.generated_document else None

    def get_generated_document_url(self, obj):
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
    custom_request = serializers.CharField(required=False, allow_blank=True, default="")
    provider = serializers.CharField(required=False, allow_blank=True, default="")
    model = serializers.CharField(required=False, allow_blank=True, default="")


class COTAnalysisDebugSerializer(COTAnalysisSerializer):
    """Extended serializer with debug fields for developer users."""

    class Meta(COTAnalysisSerializer.Meta):
        fields = COTAnalysisSerializer.Meta.fields + ["prompt_text"]
