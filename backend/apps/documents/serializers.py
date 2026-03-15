from rest_framework import serializers

from .models import Document


class DocumentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()
    download_url = serializers.SerializerMethodField()
    chain_of_title_address = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            "id", "chain_of_title", "original_filename", "file_size",
            "mime_type", "tract_number", "last_record_holder", "description",
            "uploaded_by", "uploaded_by_name",
            "download_url", "chain_of_title_address", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "uploaded_by", "file_size", "mime_type", "original_filename"]

    def get_uploaded_by_name(self, obj):
        if obj.uploaded_by:
            return f"{obj.uploaded_by.first_name} {obj.uploaded_by.last_name}".strip() or obj.uploaded_by.email
        return None

    def get_download_url(self, obj):
        request = self.context.get("request")
        if request and obj.file:
            return request.build_absolute_uri(f"/api/documents/{obj.id}/download/")
        return None

    def get_chain_of_title_address(self, obj):
        if obj.chain_of_title:
            return obj.chain_of_title.property_address
        return None


class DocumentUploadSerializer(serializers.ModelSerializer):
    file = serializers.FileField(write_only=True)

    class Meta:
        model = Document
        fields = ["file", "chain_of_title", "tract_number", "last_record_holder", "description"]

    def create(self, validated_data):
        uploaded_file = validated_data["file"]
        validated_data["original_filename"] = uploaded_file.name
        validated_data["file_size"] = uploaded_file.size
        validated_data["mime_type"] = uploaded_file.content_type or ""
        validated_data["uploaded_by"] = self.context["request"].user
        return super().create(validated_data)
