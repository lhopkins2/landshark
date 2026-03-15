from django.contrib import admin

from .models import COTAnalysis, FormTemplate, UserSettings


@admin.register(FormTemplate)
class FormTemplateAdmin(admin.ModelAdmin):
    list_display = ["name", "original_filename", "uploaded_by", "created_at"]
    search_fields = ["name", "description"]


@admin.register(UserSettings)
class UserSettingsAdmin(admin.ModelAdmin):
    list_display = ["user", "default_provider", "updated_at"]


@admin.register(COTAnalysis)
class COTAnalysisAdmin(admin.ModelAdmin):
    list_display = ["id", "document", "status", "ai_provider", "created_by", "created_at"]
    list_filter = ["status", "ai_provider"]
