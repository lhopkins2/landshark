from django.contrib import admin

from .models import ChainOfTitle, Client, Project


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ["name", "client_type", "primary_contact_email", "is_active", "created_at"]
    list_filter = ["client_type", "is_active"]
    search_fields = ["name", "primary_contact_name", "primary_contact_email"]


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ["name", "client", "status", "created_at"]
    list_filter = ["status"]
    search_fields = ["name", "reference_number"]


@admin.register(ChainOfTitle)
class ChainOfTitleAdmin(admin.ModelAdmin):
    list_display = ["property_address", "project", "status", "created_at"]
    list_filter = ["status"]
    search_fields = ["property_address", "parcel_number"]
