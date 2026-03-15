from django.contrib import admin

from .models import Document


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ["original_filename", "tract_number", "last_record_holder", "uploaded_by", "created_at"]
    search_fields = ["original_filename", "description", "tract_number", "last_record_holder"]
