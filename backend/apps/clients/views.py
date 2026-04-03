from rest_framework import viewsets

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
    queryset = Client.objects.all()
    org_field = "organization"
    filterset_fields = ["client_type", "is_active"]
    search_fields = ["name", "primary_contact_name", "primary_contact_email", "city", "state"]
    ordering_fields = ["name", "created_at"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ClientDetailSerializer
        return ClientListSerializer

    def perform_create(self, serializer):
        org = self.get_org()
        serializer.save(organization=org)


class ProjectViewSet(OrgScopedViewMixin, viewsets.ModelViewSet):
    queryset = Project.objects.select_related("client").all()
    org_field = "client__organization"
    filterset_fields = ["client", "status"]
    search_fields = ["name", "reference_number", "description"]
    ordering_fields = ["name", "created_at"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ProjectDetailSerializer
        return ProjectSerializer


class ChainOfTitleViewSet(OrgScopedViewMixin, viewsets.ModelViewSet):
    queryset = ChainOfTitle.objects.select_related("project").all()
    org_field = "project__client__organization"
    filterset_fields = ["project", "status"]
    search_fields = ["property_address", "county", "parcel_number"]
    ordering_fields = ["property_address", "created_at"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ChainOfTitleDetailSerializer
        return ChainOfTitleSerializer
