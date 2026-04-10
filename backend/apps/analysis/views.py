import datetime
import logging

from django.core.files.base import ContentFile
from django.db.models import Q
from django.utils import timezone
from django_q.tasks import async_task
from rest_framework import status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import HasApiKeyAccess, IsOrgAdmin
from apps.core.audit import log_action
from apps.core.models import AuditLog
from apps.documents.models import Document

from .models import COTAnalysis, FormTemplate, OrganizationSettings, UserSettings
from .serializers import (
    COTAnalysisDebugSerializer,
    COTAnalysisSerializer,
    FormTemplateSerializer,
    FormTemplateUploadSerializer,
    OrganizationSettingsSerializer,
    RunAnalysisSerializer,
    UserSettingsSerializer,
)
from .services.ai_providers import list_models
from .utils import is_qcluster_running, recover_stale_analyses

logger = logging.getLogger(__name__)


def resolve_api_config(user):
    """Resolve API keys and defaults for a user.

    Returns (provider, model, api_key_map) with fallback:
    1. If user has API key access and personal keys configured, use those.
    2. Otherwise, fall back to organization-level settings.
    """
    from apps.accounts.models import Membership

    # Check if user has personal settings with keys
    try:
        user_settings = UserSettings.objects.get(user=user)
    except UserSettings.DoesNotExist:
        user_settings = None

    # Determine if user has API key access
    has_access = getattr(user, "is_developer", False)
    if not has_access:
        membership = getattr(user, "membership", None)
        if membership:
            has_access = membership.role == "admin" or membership.has_api_key_access

    # If user has access and personal keys, use them
    if has_access and user_settings:
        key_map = {
            "anthropic": user_settings.anthropic_api_key,
            "openai": user_settings.openai_api_key,
            "gemini": user_settings.gemini_api_key,
        }
        if any(key_map.values()):
            return user_settings.default_provider, user_settings.default_model, key_map

    # Fall back to org settings
    try:
        membership = user.membership
        org_settings = OrganizationSettings.objects.get(organization=membership.organization)
        key_map = {
            "anthropic": org_settings.anthropic_api_key,
            "openai": org_settings.openai_api_key,
            "gemini": org_settings.gemini_api_key,
        }
        return org_settings.default_provider, org_settings.default_model, key_map
    except (Membership.DoesNotExist, OrganizationSettings.DoesNotExist):
        pass

    # No keys available at all
    if user_settings:
        return user_settings.default_provider, user_settings.default_model, {
            "anthropic": user_settings.anthropic_api_key,
            "openai": user_settings.openai_api_key,
            "gemini": user_settings.gemini_api_key,
        }
    return "anthropic", "", {"anthropic": "", "openai": "", "gemini": ""}


class FormTemplateViewSet(viewsets.ModelViewSet):
    queryset = FormTemplate.objects.select_related("uploaded_by").all()
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at"]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if getattr(user, "is_developer", False):
            return qs
        membership = getattr(user, "membership", None)
        if not membership:
            return qs.none()
        return qs.filter(uploaded_by__membership__organization=membership.organization)

    def get_serializer_class(self):
        if self.action == "create":
            return FormTemplateUploadSerializer
        return FormTemplateSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        template = serializer.save()

        # Also create a Document record so it appears in Documents tab
        doc = Document(
            original_filename=template.original_filename,
            file_size=template.file_size,
            mime_type=template.mime_type,
            description=f"Form template: {template.name}",
            uploaded_by=request.user,
        )
        # Copy file content so Document has its own file in documents/ path
        template.file.seek(0)
        doc.file.save(template.original_filename, ContentFile(template.file.read()), save=True)

        return Response(
            FormTemplateSerializer(template, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class UserSettingsView(APIView):
    """GET/PUT endpoint for the current user's analysis settings."""

    def get(self, request):
        settings_obj, _ = UserSettings.objects.get_or_create(user=request.user)
        return Response(UserSettingsSerializer(settings_obj).data)

    def put(self, request):
        self.check_permissions(request)
        settings_obj, _ = UserSettings.objects.get_or_create(user=request.user)
        serializer = UserSettingsSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSettingsSerializer(settings_obj).data)

    def get_permissions(self):
        if self.request.method == "PUT":
            return [IsAuthenticated(), HasApiKeyAccess()]
        return [IsAuthenticated()]


class OrgSettingsView(APIView):
    """GET/PUT endpoint for organization-level analysis settings (admin only)."""

    permission_classes = [IsAuthenticated, IsOrgAdmin]

    def _get_org(self, user):
        from apps.accounts.models import Membership
        try:
            return user.membership.organization
        except Membership.DoesNotExist:
            return None

    def get(self, request):
        org = self._get_org(request.user)
        if not org:
            return Response({"detail": "No organization found."}, status=status.HTTP_400_BAD_REQUEST)
        settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
        return Response(OrganizationSettingsSerializer(settings_obj).data)

    def put(self, request):
        org = self._get_org(request.user)
        if not org:
            return Response({"detail": "No organization found."}, status=status.HTTP_400_BAD_REQUEST)
        settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
        serializer = OrganizationSettingsSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(OrganizationSettingsSerializer(settings_obj).data)


class COTAnalysisViewSet(viewsets.ReadOnlyModelViewSet):
    """List and retrieve past analyses."""

    serializer_class = COTAnalysisSerializer
    filterset_fields = ["status", "document"]
    ordering_fields = ["created_at"]

    def get_queryset(self):
        return COTAnalysis.objects.filter(created_by=self.request.user).select_related(
            "document", "generated_document"
        )

    def retrieve(self, request, *args, **kwargs):
        # On every poll for a single analysis, check for stale tasks
        recover_stale_analyses()
        return super().retrieve(request, *args, **kwargs)


class ListModelsView(APIView):
    """GET endpoint to list available models for a provider."""

    def get(self, request):
        provider = request.query_params.get("provider")
        if not provider:
            return Response({"detail": "provider query param required."}, status=status.HTTP_400_BAD_REQUEST)

        _, _, api_key_map = resolve_api_config(request.user)
        api_key = api_key_map.get(provider, "")
        if not api_key:
            return Response(
                {"detail": f"No API key configured for {provider}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            models = list_models(provider, api_key)
            return Response({"models": models})
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class RunAnalysisView(APIView):
    """POST endpoint to trigger a COT analysis. Returns immediately and processes in background."""

    def post(self, request):
        serializer = RunAnalysisSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Pre-flight: ensure the background worker is running
        if not is_qcluster_running():
            return Response(
                {
                    "detail": (
                        "The background task worker is not running. "
                        "Analysis cannot be processed. Please start the worker "
                        "(python manage.py qcluster) and try again."
                    )
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            doc_qs = Document.objects.all()
            user = request.user
            if not getattr(user, "is_developer", False):
                from django.db.models import Q

                membership = getattr(user, "membership", None)
                if not membership:
                    return Response({"detail": "Document not found."}, status=status.HTTP_404_NOT_FOUND)
                org = membership.organization
                doc_qs = doc_qs.filter(
                    Q(chain_of_title__project__client__organization=org)
                    | Q(chain_of_title__isnull=True, uploaded_by__membership__organization=org)
                )
            document = doc_qs.get(id=serializer.validated_data["document_id"])
        except Document.DoesNotExist:
            return Response({"detail": "Document not found."}, status=status.HTTP_404_NOT_FOUND)

        # Resolve API config with user → org fallback
        default_provider, default_model, api_key_map = resolve_api_config(request.user)

        # Allow per-request provider/model override, fall back to resolved defaults
        provider = serializer.validated_data.get("provider") or default_provider
        model = serializer.validated_data.get("model") or default_model
        api_key = api_key_map.get(provider, "")

        if not api_key:
            return Response(
                {"detail": f"No API key configured for {provider}. Please add one in Settings."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        output_format = serializer.validated_data.get("output_format", "pdf")
        custom_request = serializer.validated_data.get("custom_request", "")
        legal_description = serializer.validated_data.get("legal_description", "")

        analysis = COTAnalysis.objects.create(
            document=document,
            analysis_order=serializer.validated_data["analysis_order"],
            output_format=output_format,
            status=COTAnalysis.Status.PROCESSING,
            progress_step=COTAnalysis.ProgressStep.QUEUED,
            ai_provider=provider,
            ai_model=model,
            created_by=request.user,
        )

        log_action(
            action=AuditLog.Action.ANALYSIS_RUN,
            user=request.user,
            document_name=document.original_filename,
            document_id=document.id,
            details={
                "analysis_id": str(analysis.id),
                "provider": provider,
                "model": model,
                "output_format": output_format,
                "legal_description": legal_description,
                "custom_request": custom_request,
            },
        )

        # Queue background task via Django-Q2
        async_task(
            "apps.analysis.tasks.run_analysis_task",
            str(analysis.id),
            str(document.id),
            serializer.validated_data["analysis_order"],
            output_format,
            provider,
            api_key,
            model,
            str(request.user.id),
            custom_request,
            legal_description,
            task_name=f"analysis-{analysis.id}",
            timeout=480,
        )

        return Response(
            COTAnalysisSerializer(analysis).data,
            status=status.HTTP_202_ACCEPTED,
        )


class CancelAnalysisView(APIView):
    """POST endpoint to cancel an in-progress analysis."""

    def post(self, request, pk):
        try:
            analysis = COTAnalysis.objects.get(id=pk, created_by=request.user)
        except COTAnalysis.DoesNotExist:
            return Response({"detail": "Analysis not found."}, status=status.HTTP_404_NOT_FOUND)

        if analysis.status not in (COTAnalysis.Status.PENDING, COTAnalysis.Status.PROCESSING):
            return Response(
                {"detail": f"Cannot cancel analysis with status '{analysis.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        analysis.status = COTAnalysis.Status.CANCELLED
        analysis.progress_step = COTAnalysis.ProgressStep.CANCELLED
        analysis.error_message = "Cancelled by user."
        analysis.save(update_fields=["status", "progress_step", "error_message", "updated_at"])

        return Response(COTAnalysisSerializer(analysis).data)


class AnalysisDebugView(APIView):
    """GET endpoint for admin/developer debug info on an analysis."""

    def get(self, request, pk):
        user = request.user
        is_admin = getattr(user, "is_developer", False)
        if not is_admin:
            membership = getattr(user, "membership", None)
            is_admin = membership and membership.role == "admin"
        if not is_admin:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        try:
            analysis = COTAnalysis.objects.select_related("document", "generated_document").get(id=pk)
        except COTAnalysis.DoesNotExist:
            return Response({"detail": "Analysis not found."}, status=status.HTTP_404_NOT_FOUND)

        return Response(COTAnalysisDebugSerializer(analysis, context={"request": request}).data)


class WorkerHealthView(APIView):
    """GET endpoint to check if the background worker is running."""

    def get(self, request):
        alive = is_qcluster_running()
        return Response({
            "worker_running": alive,
            "stale_count": COTAnalysis.objects.filter(
                status=COTAnalysis.Status.PROCESSING,
                created_at__lt=timezone.now() - datetime.timedelta(seconds=STALE_ANALYSIS_TIMEOUT),
            ).count(),
        })


class DashboardStatsView(APIView):
    """GET endpoint returning dashboard statistics for the current user."""

    def get(self, request):
        user = request.user
        now = timezone.now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # Scope documents and analyses to user's org
        is_dev = getattr(user, "is_developer", False)
        membership = getattr(user, "membership", None)

        if is_dev:
            doc_qs = Document.objects.all()
            analysis_qs = COTAnalysis.objects.all()
        elif membership:
            org = membership.organization
            doc_qs = Document.objects.filter(
                Q(chain_of_title__project__client__organization=org)
                | Q(chain_of_title__isnull=True, uploaded_by__membership__organization=org)
            )
            analysis_qs = COTAnalysis.objects.filter(created_by__membership__organization=org)
        else:
            doc_qs = Document.objects.none()
            analysis_qs = COTAnalysis.objects.none()

        total_documents = doc_qs.count()
        analyses_this_month = analysis_qs.filter(created_at__gte=month_start).count()
        pending_analyses = analysis_qs.filter(status__in=["pending", "processing"]).count()

        # Recent activity: last 10 analyses
        recent = analysis_qs.select_related("document", "created_by").order_by("-created_at")[:10]
        activity = []
        for a in recent:
            activity.append({
                "id": str(a.id),
                "type": "analysis",
                "status": a.status,
                "document_name": a.document.original_filename if a.document else None,
                "created_by_name": (
                    f"{a.created_by.first_name} {a.created_by.last_name}".strip()
                    if a.created_by else None
                ),
                "created_at": a.created_at.isoformat(),
            })

        return Response({
            "total_documents": total_documents,
            "analyses_this_month": analyses_this_month,
            "pending_analyses": pending_analyses,
            "recent_activity": activity,
        })


class BackupStatusView(APIView):
    """GET endpoint to check backup health. Admin/developer only."""

    BACKUP_STATUS_FILE = "/var/log/landshark/backup-status.json"
    STALENESS_HOURS = 7  # slightly over the 6-hour interval

    def get(self, request):
        import json
        from pathlib import Path

        user = request.user
        is_admin = getattr(user, "is_developer", False)
        if not is_admin:
            membership = getattr(user, "membership", None)
            is_admin = membership and membership.role == "admin"
        if not is_admin:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        status_path = Path(self.BACKUP_STATUS_FILE)
        if not status_path.exists():
            return Response(
                {"healthy": False, "error": "No backup status file found — backups may not be configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            data = json.loads(status_path.read_text())
        except (json.JSONDecodeError, OSError) as e:
            return Response(
                {"healthy": False, "error": f"Cannot read backup status: {e}"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        last_run = datetime.fromisoformat(data["timestamp"])
        age = timezone.now() - last_run
        age_hours = age.total_seconds() / 3600
        healthy = data.get("success", False) and age_hours < self.STALENESS_HOURS

        return Response(
            {
                "healthy": healthy,
                "last_backup": data["timestamp"],
                "age_hours": round(age_hours, 1),
                "success": data.get("success", False),
                "details": data.get("details", {}),
            },
            status=status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE,
        )
