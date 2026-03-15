from rest_framework import serializers

from .models import ChainOfTitle, Client, Project


class ChainOfTitleSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source="project.name", read_only=True)
    document_count = serializers.SerializerMethodField()

    class Meta:
        model = ChainOfTitle
        fields = [
            "id", "project", "project_name", "property_address", "county", "state",
            "parcel_number", "legal_description", "status", "notes",
            "document_count", "created_at", "updated_at",
        ]

    def get_document_count(self, obj):
        return obj.documents.count()


class ChainOfTitleDetailSerializer(ChainOfTitleSerializer):
    documents = serializers.SerializerMethodField()

    class Meta(ChainOfTitleSerializer.Meta):
        fields = ChainOfTitleSerializer.Meta.fields + ["documents"]

    def get_documents(self, obj):
        from apps.documents.serializers import DocumentSerializer
        return DocumentSerializer(obj.documents.all(), many=True).data


class ProjectSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.name", read_only=True)
    chain_count = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = [
            "id", "client", "client_name", "name", "reference_number", "status",
            "description", "notes", "chain_count", "created_at", "updated_at",
        ]

    def get_chain_count(self, obj):
        return obj.chains_of_title.count()


class ProjectDetailSerializer(ProjectSerializer):
    chains_of_title = ChainOfTitleSerializer(many=True, read_only=True)

    class Meta(ProjectSerializer.Meta):
        fields = ProjectSerializer.Meta.fields + ["chains_of_title"]


class ClientListSerializer(serializers.ModelSerializer):
    project_count = serializers.SerializerMethodField()

    class Meta:
        model = Client
        fields = [
            "id", "name", "client_type", "primary_contact_name",
            "primary_contact_email", "primary_contact_phone",
            "city", "state", "zip_code", "is_active", "notes",
            "project_count", "created_at", "updated_at",
        ]

    def get_project_count(self, obj):
        return obj.projects.count()


class ClientDetailSerializer(ClientListSerializer):
    projects = ProjectSerializer(many=True, read_only=True)

    class Meta(ClientListSerializer.Meta):
        fields = ClientListSerializer.Meta.fields + ["projects"]
