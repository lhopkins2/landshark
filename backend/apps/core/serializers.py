from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", default="")
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            "id", "action", "user_email", "user_name",
            "document_name", "document_id", "details",
            "created_at",
        ]

    def get_user_name(self, obj):
        if not obj.user:
            return ""
        parts = [obj.user.first_name, obj.user.last_name]
        return " ".join(p for p in parts if p) or obj.user.email
