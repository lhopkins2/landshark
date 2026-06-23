from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.analysis.models import COTAnalysis, FormTemplate
from apps.documents.models import Document

from .enterprise_serializers import (
    EnterpriseAddMemberSerializer,
    EnterpriseOrgCreateSerializer,
    EnterpriseOrgDetailSerializer,
    EnterpriseOrgListSerializer,
    EnterpriseOrgMemberSerializer,
    EnterpriseOrgTemplateSerializer,
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


class EnterpriseOrgTemplatesView(APIView):
    """List + upload COT templates assigned to an organization (dev admins only).

    Upload auto-preps the DOCX (injects docxtpl markers into a plain form;
    already-templated docs pass through) and assigns it to the URL's org.
    """

    permission_classes = [IsAuthenticated, IsEnterprise]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, pk):
        templates = (
            FormTemplate.objects.filter(organization_id=pk)
            .select_related("uploaded_by")
            .order_by("-created_at")
        )
        return Response(EnterpriseOrgTemplateSerializer(templates, many=True).data)

    def post(self, request, pk):
        import os

        from django.core.files.base import ContentFile

        from apps.analysis.services.template_intake import (
            DOCX_MIME,
            TemplatePreparationError,
            prepare_template_bytes,
        )

        try:
            org = Organization.objects.get(pk=pk)
        except Organization.DoesNotExist:
            return Response({"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND)

        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response({"detail": "A .docx file is required."}, status=status.HTTP_400_BAD_REQUEST)
        if (uploaded.content_type or "") != DOCX_MIME and not uploaded.name.lower().endswith(".docx"):
            return Response({"detail": "Only .docx files are allowed."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            prepared = prepare_template_bytes(uploaded)
        except TemplatePreparationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({"detail": f"Could not process this DOCX: {exc}"}, status=status.HTTP_400_BAD_REQUEST)

        name = (request.data.get("name") or "").strip() or os.path.splitext(uploaded.name)[0]
        template = FormTemplate(
            name=name,
            organization=org,
            uploaded_by=request.user,
            original_filename=uploaded.name,
            file_size=len(prepared),
            mime_type=DOCX_MIME,
        )
        template.file.save(uploaded.name, ContentFile(prepared), save=True)
        return Response(EnterpriseOrgTemplateSerializer(template).data, status=status.HTTP_201_CREATED)


class EnterpriseOrgTemplateDetailView(APIView):
    """Delete a COT template from an organization (dev admins only)."""

    permission_classes = [IsAuthenticated, IsEnterprise]

    def delete(self, request, pk, template_id):
        try:
            template = FormTemplate.objects.get(pk=template_id, organization_id=pk)
        except FormTemplate.DoesNotExist:
            return Response({"detail": "Template not found."}, status=status.HTTP_404_NOT_FOUND)
        template.delete()  # post_delete signal removes the stored file
        return Response(status=status.HTTP_204_NO_CONTENT)


class EnterpriseApiUsageView(APIView):
    """GET endpoint returning per-org API token usage."""

    permission_classes = [IsAuthenticated, IsEnterprise]

    def get(self, request):
        now = timezone.now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        org_usage = (
            COTAnalysis.objects.filter(
                created_at__gte=month_start,
                created_by__membership__isnull=False,
            )
            .values(
                "created_by__membership__organization__id",
                "created_by__membership__organization__name",
            )
            .annotate(
                analysis_count=Count("id"),
                total_input_tokens=Sum("input_tokens"),
                total_output_tokens=Sum("output_tokens"),
            )
            .order_by("-total_input_tokens")
        )

        organizations = []
        platform_input = 0
        platform_output = 0
        platform_analyses = 0

        for row in org_usage:
            input_t = row["total_input_tokens"] or 0
            output_t = row["total_output_tokens"] or 0
            count = row["analysis_count"] or 0
            organizations.append({
                "org_id": str(row["created_by__membership__organization__id"]),
                "org_name": row["created_by__membership__organization__name"],
                "analysis_count": count,
                "input_tokens": input_t,
                "output_tokens": output_t,
                "total_tokens": input_t + output_t,
            })
            platform_input += input_t
            platform_output += output_t
            platform_analyses += count

        return Response({
            "period": month_start.strftime("%Y-%m"),
            "platform_totals": {
                "analysis_count": platform_analyses,
                "input_tokens": platform_input,
                "output_tokens": platform_output,
                "total_tokens": platform_input + platform_output,
            },
            "organizations": organizations,
        })
