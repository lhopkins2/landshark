import datetime
import logging
import os
from typing import Any

from django.utils import timezone
from django_q.tasks import async_task
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.mixins import get_user_organization
from apps.accounts.models import Organization
from apps.accounts.permissions import HasApiKeyAccess, IsOrgAdmin
from apps.core.audit import log_action
from apps.core.models import AuditLog
from apps.documents.models import Document, org_scoped_documents

from .models import COTAnalysis, FormTemplate, OrganizationSettings, UserSettings
from .serializers import (
    COTAnalysisDebugSerializer,
    COTAnalysisSerializer,
    FormTemplateSerializer,
    OrganizationSettingsSerializer,
    ReanalyzeSerializer,
    RunAnalysisSerializer,
    UserSettingsSerializer,
)
from .services.ai_providers import list_models
from .services.document_generator import generate_document, strip_page_column
from .utils import STALE_ANALYSIS_TIMEOUT, is_qcluster_running, recover_stale_analyses

logger = logging.getLogger(__name__)


def _cluster_for_user(user: Any) -> str | None:
    """Return the Django-Q2 cluster name an analysis enqueued by `user` should run on.

    Enterprise-tier orgs get the isolated `enterprise` pool. Everyone else
    (standard-tier orgs, developers, orgless users) returns None, which means
    "the default unnamed cluster" to `async_task`. See settings.Q_CLUSTER and
    its `ALT_CLUSTERS` entry, plus `deploy/landshark-worker-enterprise.service`,
    for the worker side.
    """
    org = get_user_organization(user)
    if org is not None and org.tier == Organization.Tier.ENTERPRISE:
        return "enterprise"
    return None


def _user_visible_form_template(user: Any, template_id: str) -> "FormTemplate":
    """Look up a FormTemplate scoped to the user's org.

    Developers see everything. Org users see templates assigned to their org.
    Raises `FormTemplate.DoesNotExist` if the lookup misses, so the caller can 404.
    """
    qs = FormTemplate.objects.all()
    if not getattr(user, "is_developer", False):
        membership = getattr(user, "membership", None)
        if not membership:
            raise FormTemplate.DoesNotExist
        qs = qs.filter(organizations=membership.organization)
    return qs.get(id=template_id)


def _user_is_admin(user: Any) -> bool:
    """Return True if the user is a developer or an org admin."""
    if getattr(user, "is_developer", False):
        return True
    membership = getattr(user, "membership", None)
    return bool(membership and membership.role == "admin")


def resolve_api_config(user: Any) -> tuple[str, str, dict[str, str]]:
    """Resolve (provider, model, api_key_map) for a user.

    Prefers personal keys if the user has API key access and any are set;
    otherwise falls back to the organization's settings, then to a final default.
    """
    from apps.accounts.models import Membership

    try:
        user_settings = UserSettings.objects.get(user=user)
    except UserSettings.DoesNotExist:
        user_settings = None

    has_access = getattr(user, "is_developer", False)
    if not has_access:
        membership = getattr(user, "membership", None)
        if membership:
            has_access = membership.role == "admin" or membership.has_api_key_access

    if has_access and user_settings:
        key_map = {
            "anthropic": user_settings.anthropic_api_key,
            "openai": user_settings.openai_api_key,
            "gemini": user_settings.gemini_api_key,
        }
        if any(key_map.values()):
            return user_settings.default_provider, user_settings.default_model, key_map

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

    if user_settings:
        return (
            user_settings.default_provider,
            user_settings.default_model,
            {
                "anthropic": user_settings.anthropic_api_key,
                "openai": user_settings.openai_api_key,
                "gemini": user_settings.gemini_api_key,
            },
        )
    return "anthropic", "", {"anthropic": "", "openai": "", "gemini": ""}


class FormTemplateViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only access to the templates assigned to the user's org (Export dropdown).

    Templates are managed by dev admins on the Enterprise → Templates tab
    (apps.accounts.enterprise_views), not here — org users only list/select.
    """

    queryset = FormTemplate.objects.select_related("uploaded_by").prefetch_related("organizations").all()
    serializer_class = FormTemplateSerializer
    permission_classes = [IsAuthenticated]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at"]

    def get_queryset(self) -> Any:
        qs = super().get_queryset()
        user = self.request.user
        if getattr(user, "is_developer", False):
            return qs
        membership = getattr(user, "membership", None)
        if not membership:
            return qs.none()
        return qs.filter(organizations=membership.organization)

    @action(detail=False, methods=["get"], url_path="starter", permission_classes=[IsAuthenticated])
    def starter(self, request: Any) -> Any:
        """Stream the bundled starter COT template — shops download, restyle in Word, re-upload."""
        from django.http import FileResponse

        from .services.template_renderer import STARTER_TEMPLATE_PATH

        if not os.path.exists(STARTER_TEMPLATE_PATH):
            return Response({"detail": "Starter template not found on server."}, status=status.HTTP_404_NOT_FOUND)
        response = FileResponse(
            open(STARTER_TEMPLATE_PATH, "rb"),
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        response["Content-Disposition"] = 'attachment; filename="cot_starter_template.docx"'
        return response


class UserSettingsView(APIView):
    """GET/PUT endpoint for the current user's analysis settings."""

    def get(self, request: Any) -> Response:
        settings_obj, _ = UserSettings.objects.get_or_create(user=request.user)
        return Response(UserSettingsSerializer(settings_obj).data)

    def put(self, request: Any) -> Response:
        self.check_permissions(request)
        settings_obj, _ = UserSettings.objects.get_or_create(user=request.user)
        serializer = UserSettingsSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSettingsSerializer(settings_obj).data)

    def get_permissions(self) -> list:
        if self.request.method == "PUT":
            return [IsAuthenticated(), HasApiKeyAccess()]
        return [IsAuthenticated()]


class OrgSettingsView(APIView):
    """GET/PUT endpoint for organization-level analysis settings (admin only)."""

    permission_classes = [IsAuthenticated, IsOrgAdmin]

    def get(self, request: Any) -> Response:
        org = get_user_organization(request.user)
        if not org:
            return Response({"detail": "No organization found."}, status=status.HTTP_400_BAD_REQUEST)
        settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
        return Response(OrganizationSettingsSerializer(settings_obj).data)

    def put(self, request: Any) -> Response:
        org = get_user_organization(request.user)
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

    def get_queryset(self) -> Any:
        return COTAnalysis.objects.filter(created_by=self.request.user).select_related("document", "generated_document")

    def retrieve(self, request: Any, *args: Any, **kwargs: Any) -> Response:
        recover_stale_analyses()
        return super().retrieve(request, *args, **kwargs)


class ListModelsView(APIView):
    """GET endpoint to list available models for a provider."""

    def get(self, request: Any) -> Response:
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

    def post(self, request: Any) -> Response:
        serializer = RunAnalysisSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

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
            document = org_scoped_documents(request.user).get(id=serializer.validated_data["document_id"])
        except Document.DoesNotExist:
            return Response({"detail": "Document not found."}, status=status.HTTP_404_NOT_FOUND)

        default_provider, default_model, api_key_map = resolve_api_config(request.user)
        provider = serializer.validated_data.get("provider") or default_provider
        model = serializer.validated_data.get("model") or default_model
        api_key = api_key_map.get(provider, "")

        if not api_key:
            return Response(
                {"detail": f"No API key configured for {provider}. Please add one in Settings."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        output_format = serializer.validated_data.get("output_format", "pdf")
        legal_description = serializer.validated_data.get("legal_description", "")

        # Operator-entered report-header values (prefilled + editable on the form).
        from .services.header import EDITABLE_HEADER_KEYS

        header_fields = {key: serializer.validated_data.get(key, "") or "" for key in EDITABLE_HEADER_KEYS}
        # `legal_description` is also its own param above; keep it in the header dict too.
        header_fields["legal_description"] = legal_description

        analysis = COTAnalysis.objects.create(
            document=document,
            document_name_snapshot=document.original_filename or "",
            analysis_order=serializer.validated_data["analysis_order"],
            output_format=output_format,
            header_fields=header_fields,
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
            },
        )

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
            legal_description,
            task_name=f"analysis-{analysis.id}",
            timeout=480,
            cluster=_cluster_for_user(request.user),
        )

        return Response(
            COTAnalysisSerializer(analysis).data,
            status=status.HTTP_202_ACCEPTED,
        )


class ReanalyzeView(APIView):
    """POST a revision of an existing analysis.

    Creates a child COTAnalysis (linked via `parent_analysis`) and dispatches the
    background `reanalyze_task` with edits, pages-to-rescan, and free-form instructions.
    """

    def post(self, request: Any, pk: str) -> Response:
        try:
            parent = COTAnalysis.objects.get(id=pk, created_by=request.user)
        except COTAnalysis.DoesNotExist:
            return Response({"detail": "Analysis not found."}, status=status.HTTP_404_NOT_FOUND)

        if not parent.pipeline_version or not parent.parsed_documents:
            return Response(
                {"detail": "Re-analyze is only available for new-pipeline analyses with parsed_documents."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not parent.document:
            return Response(
                {"detail": "Parent analysis has no source document; cannot re-analyze."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not is_qcluster_running():
            return Response(
                {
                    "detail": (
                        "The background task worker is not running. "
                        "Re-analysis cannot be processed. Please start the worker "
                        "(python manage.py qcluster) and try again."
                    )
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        serializer = ReanalyzeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        default_provider, default_model, api_key_map = resolve_api_config(request.user)
        provider = serializer.validated_data.get("provider") or default_provider or parent.ai_provider
        model = serializer.validated_data.get("model") or default_model or parent.ai_model
        api_key = api_key_map.get(provider, "")
        if not api_key:
            return Response(
                {"detail": f"No API key configured for {provider}. Please add one in Settings."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pages_to_rescan = serializer.validated_data.get("pages_to_rescan") or []
        parent_total_pages = 0
        for pd in parent.parsed_documents or []:
            parent_total_pages = max(parent_total_pages, int(pd.get("total_pages") or 0))
        if parent_total_pages and any(p > parent_total_pages or p < 1 for p in pages_to_rescan):
            return Response(
                {"detail": f"pages_to_rescan must be within 1..{parent_total_pages}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        output_format = serializer.validated_data.get("output_format") or parent.output_format

        snapshot_name = (parent.document.original_filename if parent.document else parent.document_name_snapshot) or ""
        analysis = COTAnalysis.objects.create(
            document=parent.document,
            document_name_snapshot=snapshot_name,
            analysis_order=parent.analysis_order,
            output_format=output_format,
            status=COTAnalysis.Status.PROCESSING,
            progress_step=COTAnalysis.ProgressStep.QUEUED,
            ai_provider=provider,
            ai_model=model,
            created_by=request.user,
            parent_analysis=parent,
            # Carry the operator's report-header values onto the revision.
            header_fields=parent.header_fields or {},
            revision_instructions=serializer.validated_data.get("user_instructions", "") or "",
            revision_kind=COTAnalysis.RevisionKind.REVISION,
        )

        log_action(
            action=AuditLog.Action.ANALYSIS_RUN,
            user=request.user,
            document_name=parent.document.original_filename,
            document_id=parent.document.id,
            details={
                "analysis_id": str(analysis.id),
                "parent_analysis_id": str(parent.id),
                "provider": provider,
                "model": model,
                "output_format": output_format,
                "revision": True,
                "instrument_edits_count": len(serializer.validated_data.get("instrument_edits") or []),
                "pages_rescanned": pages_to_rescan,
                "has_instructions": bool(serializer.validated_data.get("user_instructions")),
            },
        )

        async_task(
            "apps.analysis.tasks.reanalyze_task",
            str(analysis.id),
            str(parent.id),
            serializer.validated_data.get("instrument_edits") or [],
            pages_to_rescan,
            serializer.validated_data.get("user_instructions", "") or "",
            provider,
            api_key,
            model,
            str(request.user.id),
            output_format,
            parent.analysis_order,
            task_name=f"reanalyze-{analysis.id}",
            timeout=480,
            cluster=_cluster_for_user(request.user),
        )

        return Response(
            COTAnalysisSerializer(analysis, context={"request": request}).data,
            status=status.HTTP_202_ACCEPTED,
        )


class ExportAnalysisView(APIView):
    """POST a render request for an analyzed-COT, returning the file as a blob.

    Re-renders `analysis.result_text` to PDF or DOCX, optionally stripping the
    Doc Pg column, and streams the result. Nothing is persisted to the DB —
    this is a pure post-processing download. Subsumes the previous
    convert-to-docx and strip-doc-pg endpoints.

    When `template_id` is supplied AND the format is `docx`, renders through a
    FormTemplate (docxtpl) instead of the default markdown-to-docx generator.
    Templated PDF is not supported in v1.
    """

    _MIME = {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }

    def post(self, request: Any, pk: str) -> Response:
        from django.http import HttpResponse

        from .services.template_renderer import render_analysis_with_template

        try:
            analysis = COTAnalysis.objects.get(id=pk, created_by=request.user)
        except COTAnalysis.DoesNotExist:
            return Response({"detail": "Analysis not found."}, status=status.HTTP_404_NOT_FOUND)

        if not (analysis.result_text or "").strip() and not analysis.parsed_documents:
            return Response(
                {"detail": "This analysis has no rendered output to export."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_format = (request.data.get("format") or analysis.output_format or "pdf").lower()
        if target_format not in ("pdf", "docx"):
            return Response(
                {"detail": "format must be 'pdf' or 'docx'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Template flow: only supported for DOCX output in v1 (no docx→pdf path on the box).
        template_id = (request.data.get("template_id") or "").strip()
        template: FormTemplate | None = None
        if template_id:
            if target_format != "docx":
                return Response(
                    {"detail": "Template export is only available for DOCX format."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                template = _user_visible_form_template(request.user, template_id)
            except FormTemplate.DoesNotExist:
                return Response({"detail": "Template not found."}, status=status.HTTP_404_NOT_FOUND)

        strip_doc_pg = bool(request.data.get("strip_doc_pg"))
        markdown = strip_page_column(analysis.result_text) if strip_doc_pg else analysis.result_text

        # Default filename derived from the generated document (or source); user-supplied wins.
        if analysis.generated_document:
            default_base = os.path.splitext(analysis.generated_document.original_filename)[0]
        elif analysis.document:
            default_base = os.path.splitext(analysis.document.original_filename)[0]
        else:
            default_base = "analysis"

        raw_name = (request.data.get("filename") or "").strip()
        base = os.path.splitext(raw_name)[0] if raw_name else default_base
        # Sanitize: strip path separators and quotes (Content-Disposition injection guard).
        base = base.replace("/", "_").replace("\\", "_").replace('"', "'").replace("\n", "").replace("\r", "")
        if not base:
            base = default_base
        filename = f"{base}.{target_format}"

        if template is not None:
            # Templated render: docxtpl reads structured data straight off the analysis row.
            # The strip_doc_pg toggle has no effect here — the template's columns are whatever
            # the shop authored. We pass the user's analyze-time legal description + title agent
            # so the header section matches what the markdown renderer would have produced.
            from .tasks import _resolve_title_agent_name

            agent_name = _resolve_title_agent_name(request.user)
            try:
                buf = render_analysis_with_template(
                    analysis=analysis,
                    template=template,
                    legal_description="",  # per-run legal_description isn't stored on the analysis row today
                    title_agent_name=agent_name,
                )
            except Exception as exc:
                logger.exception("Template render failed for analysis %s template %s", analysis.id, template.id)
                return Response(
                    {"detail": f"Template render failed: {exc}"},
                    status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                )
        else:
            buf = generate_document(markdown, target_format, title=base)
        data = buf.getvalue()

        log_action(
            action=AuditLog.Action.ANALYSIS_RUN,
            user=request.user,
            document_name=filename,
            document_id=None,
            details={
                "action": "export_analysis",
                "analysis_id": str(analysis.id),
                "format": target_format,
                "strip_doc_pg": strip_doc_pg,
            },
        )

        response = HttpResponse(data, content_type=self._MIME[target_format])
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        response["Content-Length"] = len(data)
        return response


class CancelAnalysisView(APIView):
    """POST endpoint to cancel an in-progress analysis."""

    def post(self, request: Any, pk: str) -> Response:
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

    def get(self, request: Any, pk: str) -> Response:
        if not _user_is_admin(request.user):
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        try:
            analysis = COTAnalysis.objects.select_related("document", "generated_document").get(id=pk)
        except COTAnalysis.DoesNotExist:
            return Response({"detail": "Analysis not found."}, status=status.HTTP_404_NOT_FOUND)

        return Response(COTAnalysisDebugSerializer(analysis, context={"request": request}).data)


class WorkerHealthView(APIView):
    """GET endpoint to check if the background worker is running."""

    def get(self, request: Any) -> Response:
        alive = is_qcluster_running()
        return Response(
            {
                "worker_running": alive,
                "stale_count": COTAnalysis.objects.filter(
                    status=COTAnalysis.Status.PROCESSING,
                    created_at__lt=timezone.now() - datetime.timedelta(seconds=STALE_ANALYSIS_TIMEOUT),
                ).count(),
            }
        )


class DashboardStatsView(APIView):
    """GET endpoint returning dashboard statistics for the current user."""

    def get(self, request: Any) -> Response:
        user = request.user
        now = timezone.now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        is_dev = getattr(user, "is_developer", False)
        membership = getattr(user, "membership", None)

        doc_qs = org_scoped_documents(user)
        if is_dev:
            analysis_qs = COTAnalysis.objects.all()
        elif membership:
            analysis_qs = COTAnalysis.objects.filter(created_by__membership__organization=membership.organization)
        else:
            analysis_qs = COTAnalysis.objects.none()

        total_documents = doc_qs.count()
        analyses_this_month = analysis_qs.filter(created_at__gte=month_start).count()
        pending_analyses = analysis_qs.filter(status__in=["pending", "processing"]).count()

        recent = analysis_qs.select_related("document", "created_by").order_by("-created_at")[:10]
        activity = []
        for a in recent:
            activity.append(
                {
                    "id": str(a.id),
                    "type": "analysis",
                    "status": a.status,
                    "document_name": a.document.original_filename if a.document else None,
                    "created_by_name": (
                        f"{a.created_by.first_name} {a.created_by.last_name}".strip() if a.created_by else None
                    ),
                    "created_at": a.created_at.isoformat(),
                }
            )

        return Response(
            {
                "total_documents": total_documents,
                "analyses_this_month": analyses_this_month,
                "pending_analyses": pending_analyses,
                "recent_activity": activity,
            }
        )


class BackupStatusView(APIView):
    """GET endpoint to check backup health. Admin/developer only."""

    BACKUP_STATUS_FILE = "/var/log/landshark/backup-status.json"
    STALENESS_HOURS = 7  # one hour over the 6-hour backup interval

    def get(self, request: Any) -> Response:
        import json
        from pathlib import Path

        if not _user_is_admin(request.user):
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

        last_run = datetime.datetime.fromisoformat(data["timestamp"])
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
