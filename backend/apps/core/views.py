from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from apps.accounts.permissions import IsOrgAdmin

from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogListView(generics.ListAPIView):
    """List audit log entries. Admins see their org's logs; developers see all."""

    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated, IsOrgAdmin]

    def get_queryset(self):
        qs = AuditLog.objects.select_related("user").order_by("-created_at")
        user = self.request.user
        if not getattr(user, "is_developer", False):
            membership = getattr(user, "membership", None)
            if membership:
                qs = qs.filter(organization=membership.organization)
            else:
                return qs.none()

        action = self.request.query_params.get("action")
        if action:
            qs = qs.filter(action=action)
        search = self.request.query_params.get("search")
        if search:
            from django.db.models import Q

            qs = qs.filter(
                Q(document_name__icontains=search)
                | Q(user__email__icontains=search)
                | Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
            )
        return qs
