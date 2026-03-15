from django.http import FileResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from .models import Document
from .serializers import DocumentSerializer, DocumentUploadSerializer


class DocumentViewSet(viewsets.ModelViewSet):
    queryset = Document.objects.select_related("chain_of_title", "uploaded_by").all()
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filterset_fields = ["chain_of_title", "uploaded_by"]
    search_fields = ["original_filename", "description", "tract_number", "last_record_holder"]
    ordering_fields = ["original_filename", "created_at", "file_size"]

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
        response["Content-Disposition"] = f'attachment; filename="{document.original_filename}"'
        return response
