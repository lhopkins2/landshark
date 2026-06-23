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
    path(
        "organizations/<uuid:pk>/templates/",
        enterprise_views.EnterpriseOrgTemplatesView.as_view(),
        name="enterprise-org-templates",
    ),
    path(
        "organizations/<uuid:pk>/templates/<uuid:template_id>/",
        enterprise_views.EnterpriseOrgTemplateDetailView.as_view(),
        name="enterprise-org-template-detail",
    ),
    path("api-usage/", enterprise_views.EnterpriseApiUsageView.as_view(), name="enterprise-api-usage"),
]
