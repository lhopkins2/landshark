from django.db.models import Count
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.analysis.models import COTAnalysis
from apps.documents.models import Document

from .enterprise_serializers import (
    EnterpriseAddMemberSerializer,
    EnterpriseOrgCreateSerializer,
    EnterpriseOrgDetailSerializer,
    EnterpriseOrgListSerializer,
    EnterpriseOrgMemberSerializer,
    EnterpriseStatsSerializer,
)
from .models import Membership, Organization, User
from .permissions import IsEnterprise


class EnterpriseStatsView(APIView):
    permission_classes = [IsAuthenticated, IsEnterprise]

    def get(self, request):
        data = {
            "total_organizations": Organization.objects.count(),
            "active_organizations": Organization.objects.filter(is_active=True).count(),
            "total_users": User.objects.filter(is_active=True).count(),
            "total_documents": Document.objects.count(),
            "total_analyses": COTAnalysis.objects.count(),
        }
        serializer = EnterpriseStatsSerializer(data)
        return Response(serializer.data)


class EnterpriseOrgListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsEnterprise]
    serializer_class = EnterpriseOrgListSerializer

    def get_queryset(self):
        qs = Organization.objects.annotate(member_count=Count("memberships")).order_by("-created_at")
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(name__icontains=search)
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == "true")
        return qs

    def get_serializer_class(self):
        if self.request.method == "POST":
            return EnterpriseOrgCreateSerializer
        return EnterpriseOrgListSerializer

    def create(self, request, *args, **kwargs):
        serializer = EnterpriseOrgCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        org = serializer.save()
        # Return the org with member_count annotation
        org_with_count = Organization.objects.annotate(member_count=Count("memberships")).get(pk=org.pk)
        return Response(EnterpriseOrgListSerializer(org_with_count).data, status=status.HTTP_201_CREATED)


class EnterpriseOrgDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated, IsEnterprise]
    serializer_class = EnterpriseOrgDetailSerializer

    def get_queryset(self):
        return Organization.objects.annotate(member_count=Count("memberships"))


class EnterpriseOrgMembersView(APIView):
    permission_classes = [IsAuthenticated, IsEnterprise]

    def get(self, request, pk):
        members = Membership.objects.filter(organization_id=pk).select_related("user").order_by("-created_at")
        serializer = EnterpriseOrgMemberSerializer(members, many=True)
        return Response(serializer.data)

    def post(self, request, pk):
        try:
            org = Organization.objects.get(pk=pk)
        except Organization.DoesNotExist:
            return Response({"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = EnterpriseAddMemberSerializer(data=request.data, context={"organization": org})
        serializer.is_valid(raise_exception=True)
        membership = serializer.save()
        return Response(EnterpriseOrgMemberSerializer(membership).data, status=status.HTTP_201_CREATED)
