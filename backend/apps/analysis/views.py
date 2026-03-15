import os
import threading

from django.conf import settings as django_settings
from django.core.files.base import ContentFile
from django.db import connections
from rest_framework import status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.documents.models import Document

from .models import COTAnalysis, FormTemplate, UserSettings
from .serializers import (
    COTAnalysisSerializer,
    FormTemplateSerializer,
    FormTemplateUploadSerializer,
    RunAnalysisSerializer,
    UserSettingsSerializer,
)
from .services.ai_providers import build_prompt, list_models, run_analysis
from .services.document_generator import generate_document, generate_from_docx_template
from .services.document_parser import extract_text_from_file


class FormTemplateViewSet(viewsets.ModelViewSet):
    queryset = FormTemplate.objects.select_related("uploaded_by").all()
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at"]

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
        settings_obj, _ = UserSettings.objects.get_or_create(user=request.user)
        serializer = UserSettingsSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSettingsSerializer(settings_obj).data)


class COTAnalysisViewSet(viewsets.ReadOnlyModelViewSet):
    """List and retrieve past analyses."""

    serializer_class = COTAnalysisSerializer
    filterset_fields = ["status", "document"]
    ordering_fields = ["created_at"]

    def get_queryset(self):
        return COTAnalysis.objects.filter(created_by=self.request.user).select_related(
            "document", "form_template", "generated_document"
        )


class ListModelsView(APIView):
    """GET endpoint to list available models for a provider."""

    def get(self, request):
        provider = request.query_params.get("provider")
        if not provider:
            return Response({"detail": "provider query param required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user_settings = UserSettings.objects.get(user=request.user)
        except UserSettings.DoesNotExist:
            return Response({"detail": "Please configure your API keys first."}, status=status.HTTP_400_BAD_REQUEST)

        api_key_map = {
            "anthropic": user_settings.anthropic_api_key,
            "openai": user_settings.openai_api_key,
            "gemini": user_settings.gemini_api_key,
        }
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
            document = Document.objects.get(id=serializer.validated_data["document_id"])
        except Document.DoesNotExist:
            return Response({"detail": "Document not found."}, status=status.HTTP_404_NOT_FOUND)

        form_template_id = serializer.validated_data.get("form_template_id")
        form_template = None
        if form_template_id:
            try:
                form_template = FormTemplate.objects.get(id=form_template_id)
            except FormTemplate.DoesNotExist:
                return Response({"detail": "Form template not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            user_settings = UserSettings.objects.get(user=request.user)
        except UserSettings.DoesNotExist:
            return Response(
                {"detail": "Please configure your AI API keys in Settings first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Allow per-request provider/model override, fall back to user defaults
        provider = serializer.validated_data.get("provider") or user_settings.default_provider
        model = serializer.validated_data.get("model") or user_settings.default_model
        api_key_map = {
            "anthropic": user_settings.anthropic_api_key,
            "openai": user_settings.openai_api_key,
            "gemini": user_settings.gemini_api_key,
        }
        api_key = api_key_map.get(provider, "")

        if not api_key:
            return Response(
                {"detail": f"No API key configured for {provider}. Please add one in Settings."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        output_format = serializer.validated_data.get("output_format", "pdf")
        custom_request = serializer.validated_data.get("custom_request", "")

        analysis = COTAnalysis.objects.create(
            document=document,
            form_template=form_template,
            analysis_order=serializer.validated_data["analysis_order"],
            output_format=output_format,
            status=COTAnalysis.Status.PROCESSING,
            progress_step=COTAnalysis.ProgressStep.QUEUED,
            ai_provider=provider,
            ai_model=model,
            created_by=request.user,
        )

        # Spawn background thread with primitive args only
        thread = threading.Thread(
            target=RunAnalysisView._run_analysis_background,
            args=(
                str(analysis.id),
                str(document.id),
                str(form_template.id) if form_template else None,
                serializer.validated_data["analysis_order"],
                output_format,
                provider,
                api_key,
                model,
                str(request.user.id),
                custom_request,
            ),
            daemon=True,
        )
        thread.start()

        return Response(
            COTAnalysisSerializer(analysis).data,
            status=status.HTTP_202_ACCEPTED,
        )

    @staticmethod
    def _run_analysis_background(
        analysis_id, document_id, form_template_id,
        analysis_order, output_format, provider, api_key, model, user_id,
        custom_request="",
    ):
        """Run the full analysis pipeline in a background thread."""
        from django.contrib.auth import get_user_model
        User = get_user_model()

        try:
            analysis = COTAnalysis.objects.get(id=analysis_id)
            document = Document.objects.get(id=document_id)
            form_template = FormTemplate.objects.get(id=form_template_id) if form_template_id else None
            user = User.objects.get(id=user_id)

            generic_form_instructions = (
                "Present the results in a standard chain of title table format with these columns:\n"
                "Entry # | Recording Date | Instrument Type | Instrument/Book-Page # | Grantor | Grantee | Notes"
            )

            # Step 1: Extract text
            analysis.progress_step = COTAnalysis.ProgressStep.EXTRACTING_TEXT
            analysis.save(update_fields=["progress_step", "updated_at"])

            document_content = extract_text_from_file(document.file)
            form_template_content = (
                extract_text_from_file(form_template.file) if form_template else generic_form_instructions
            )

            # Step 2: Build prompt
            analysis.progress_step = COTAnalysis.ProgressStep.BUILDING_PROMPT
            analysis.save(update_fields=["progress_step", "updated_at"])

            prompt = build_prompt(
                document_content=document_content,
                form_template_content=form_template_content,
                analysis_order=analysis_order,
                custom_request=custom_request,
            )

            # Step 3: Call AI (longest step)
            analysis.progress_step = COTAnalysis.ProgressStep.CALLING_AI
            analysis.save(update_fields=["progress_step", "updated_at"])

            result = run_analysis(prompt, provider, api_key, model)
            analysis.result_text = result

            # Step 4: Generate document
            analysis.progress_step = COTAnalysis.ProgressStep.GENERATING_DOCUMENT
            analysis.save(update_fields=["progress_step", "updated_at"])

            base_name = os.path.splitext(document.original_filename)[0]
            doc_title = f"{base_name} - Analyzed"

            # When a DOCX form template is provided, inject rows into the
            # original template to preserve its exact formatting and images.
            use_docx_template = (
                form_template
                and form_template.file.name.lower().endswith(".docx")
            )

            if use_docx_template:
                ext = "docx"
                mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                buf = generate_from_docx_template(form_template.file, result)
            else:
                ext = "docx" if output_format == "docx" else "pdf"
                mime = (
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    if output_format == "docx"
                    else "application/pdf"
                )
                buf = generate_document(result, output_format, title=doc_title)

            generated_filename = f"{doc_title}.{ext}"
            generated_doc = Document.objects.create(
                original_filename=generated_filename,
                file_size=buf.getbuffer().nbytes,
                mime_type=mime,
                tract_number=document.tract_number,
                last_record_holder=document.last_record_holder,
                description=f"Processed from {document.original_filename}",
                uploaded_by=user,
            )
            generated_doc.file.save(generated_filename, ContentFile(buf.read()), save=True)

            # Step 5: Complete
            analysis.generated_document = generated_doc
            analysis.status = COTAnalysis.Status.COMPLETED
            analysis.progress_step = COTAnalysis.ProgressStep.COMPLETE
            analysis.save()

        except Exception as e:
            import traceback
            traceback.print_exc()
            try:
                analysis = COTAnalysis.objects.get(id=analysis_id)
                analysis.error_message = str(e)
                analysis.status = COTAnalysis.Status.FAILED
                analysis.progress_step = COTAnalysis.ProgressStep.FAILED
                analysis.save()
            except Exception:
                pass

        finally:
            connections.close_all()
