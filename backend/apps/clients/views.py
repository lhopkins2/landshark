from django.db.models import Count
from rest_framework import viewsets
from rest_framework.exceptions import ValidationError

from apps.accounts.mixins import OrgScopedViewMixin

from .models import ChainOfTitle, Client, Project
from .serializers import (
    ChainOfTitleDetailSerializer,
    ChainOfTitleSerializer,
    ClientDetailSerializer,
    ClientListSerializer,
    ProjectDetailSerializer,
    ProjectSerializer,
)


class ClientViewSet(OrgScopedViewMixin, viewsets.ModelViewSet):
    queryset = Client.objects.annotate(project_count=Count("projects")).all()
    org_field = "organization"
    filterset_fields = ["client_type", "is_active"]
    search_fields = ["name", "primary_contact_name", "primary_contact_email", "city", "state"]
    ordering_fields = ["name", "created_at"]

    def get_serializer_class(self) -> type:
        if self.action == "retrieve":
            return ClientDetailSerializer
        return ClientListSerializer

    def perform_create(self, serializer) -> None:
        org = self.get_org()
        serializer.save(organization=org)


class ProjectViewSet(OrgScopedViewMixin, viewsets.ModelViewSet):
    queryset = Project.objects.select_related("client").annotate(chain_count=Count("chains_of_title")).all()
    org_field = "client__organization"
    filterset_fields = ["client", "status"]
    search_fields = ["name", "reference_number", "description"]
    ordering_fields = ["name", "created_at"]

    def get_serializer_class(self) -> type:
        if self.action == "retrieve":
            return ProjectDetailSerializer
        return ProjectSerializer

    def perform_create(self, serializer) -> None:
        client = serializer.validated_data.get("client")
        if client and not self.get_queryset().filter(client=client).exists():
            org = self.get_org()
            if org and getattr(client, "organization_id", None) != org.id:
                raise ValidationError({"client": "Client does not belong to your organization."})
        serializer.save()


class ChainOfTitleViewSet(OrgScopedViewMixin, viewsets.ModelViewSet):
    queryset = ChainOfTitle.objects.select_related("project").annotate(document_count=Count("documents")).all()
    org_field = "project__client__organization"
    filterset_fields = ["project", "status"]
    search_fields = ["property_address", "county", "parcel_number"]
    ordering_fields = ["property_address", "created_at"]

    def get_serializer_class(self) -> type:
        if self.action == "retrieve":
            return ChainOfTitleDetailSerializer
        return ChainOfTitleSerializer

    def perform_create(self, serializer) -> None:
        project = serializer.validated_data.get("project")
        if project:
            org = self.get_org()
            if org and getattr(project.client, "organization_id", None) != org.id:
                raise ValidationError({"project": "Project does not belong to your organization."})
        serializer.save()
