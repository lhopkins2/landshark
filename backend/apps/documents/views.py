from django.db.models import Count, Q
from django.http import FileResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.mixins import OrgScopedViewMixin

from .models import Document, DocumentFolder
from .serializers import DocumentFolderSerializer, DocumentSerializer, DocumentUploadSerializer


class DocumentFolderViewSet(OrgScopedViewMixin, viewsets.ModelViewSet):
    queryset = DocumentFolder.objects.annotate(document_count=Count("documents")).all()
    serializer_class = DocumentFolderSerializer
    search_fields = ["name"]
    ordering_fields = ["name", "created_at"]
    org_field = "organization"

    def perform_create(self, serializer):
        org = self.get_org()
        serializer.save(created_by=self.request.user, organization=org if org else None)


class DocumentViewSet(viewsets.ModelViewSet):
    queryset = Document.objects.select_related("chain_of_title", "uploaded_by", "folder").all()
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filterset_fields = ["chain_of_title", "uploaded_by", "folder"]
    search_fields = ["original_filename", "description", "tract_number", "last_record_holder"]
    ordering_fields = ["original_filename", "created_at", "file_size"]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if getattr(user, "is_developer", False):
            pass
        else:
            membership = getattr(user, "membership", None)
            if not membership:
                return qs.none()
            org = membership.organization
            qs = qs.filter(
                Q(chain_of_title__project__client__organization=org)
                | Q(chain_of_title__isnull=True, uploaded_by__membership__organization=org)
            )
        if self.request.query_params.get("folder__isnull") == "true":
            qs = qs.filter(folder__isnull=True)
        return qs

    def get_serializer_class(self):
        if self.action == "create":
            return DocumentUploadSerializer
        return DocumentSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        document = serializer.save()
        return Response(
            DocumentSerializer(document, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        document = self.get_object()
        if not document.file:
            return Response({"detail": "No file attached."}, status=status.HTTP_404_NOT_FOUND)
        response = FileResponse(document.file.open("rb"), content_type=document.mime_type or "application/octet-stream")
        # Sanitize filename: strip quotes, newlines, and control chars to prevent header injection
        safe_name = document.original_filename.replace('"', "'").replace("\n", "").replace("\r", "")
        disposition = "inline" if request.query_params.get("inline") == "true" else "attachment"
        response["Content-Disposition"] = f'{disposition}; filename="{safe_name}"'
        return response

    @action(detail=True, methods=["get"], url_path="extract-text")
    def extract_text(self, request, pk=None):
        document = self.get_object()
        if not document.file:
            return Response({"detail": "No file attached."}, status=status.HTTP_404_NOT_FOUND)
        from apps.analysis.services.document_parser import extract_text_from_file

        text = extract_text_from_file(document.file)
        return Response({"text": text})

    @action(detail=False, methods=["post"], url_path="move-to-folder")
    def move_to_folder(self, request):
        """Move one or more documents to a folder (or remove from folder with folder_id=null)."""
        doc_ids = request.data.get("document_ids", [])
        folder_id = request.data.get("folder_id")

        if not doc_ids:
            return Response({"detail": "document_ids required."}, status=status.HTTP_400_BAD_REQUEST)

        folder = None
        if folder_id:
            try:
                # Scope folder lookup to user's org via the folder viewset's queryset
                folder = DocumentFolder.objects.get(id=folder_id)
                # Verify org ownership for non-developers
                user = request.user
                if not getattr(user, "is_developer", False):
                    membership = getattr(user, "membership", None)
                    if not membership or (folder.organization and folder.organization != membership.organization):
                        return Response({"detail": "Folder not found."}, status=status.HTTP_404_NOT_FOUND)
            except DocumentFolder.DoesNotExist:
                return Response({"detail": "Folder not found."}, status=status.HTTP_404_NOT_FOUND)

        # Use the org-scoped queryset so users can only move their own documents
        updated = self.get_queryset().filter(id__in=doc_ids).update(folder=folder)
        return Response({"moved": updated})
