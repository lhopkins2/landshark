from django.core.files.base import ContentFile
from django_q.tasks import async_task
from rest_framework import status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import HasApiKeyAccess, IsOrgAdmin
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
    """GET endpoint for developer-only debug info on an analysis."""

    def get(self, request, pk):
        if not getattr(request.user, "is_developer", False):
            return Response({"detail": "Developer access required."}, status=status.HTTP_403_FORBIDDEN)

        try:
            analysis = COTAnalysis.objects.select_related("document", "generated_document").get(id=pk)
        except COTAnalysis.DoesNotExist:
            return Response({"detail": "Analysis not found."}, status=status.HTTP_404_NOT_FOUND)

        return Response(COTAnalysisDebugSerializer(analysis, context={"request": request}).data)
