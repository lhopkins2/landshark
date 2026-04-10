from django.urls import path

from . import enterprise_views

urlpatterns = [
    path("stats/", enterprise_views.EnterpriseStatsView.as_view(), name="enterprise-stats"),
    path("organizations/", enterprise_views.EnterpriseOrgListCreateView.as_view(), name="enterprise-org-list"),
    path("organizations/<uuid:pk>/", enterprise_views.EnterpriseOrgDetailView.as_view(), name="enterprise-org-detail"),
    path(
        "organizations/<uuid:pk>/members/",
        enterprise_views.EnterpriseOrgMembersView.as_view(),
        name="enterprise-org-members",
    ),
]
