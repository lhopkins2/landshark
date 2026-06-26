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
    path("templates/", enterprise_views.EnterpriseTemplatesView.as_view(), name="enterprise-templates"),
    path(
        "templates/<uuid:template_id>/",
        enterprise_views.EnterpriseTemplateDetailView.as_view(),
        name="enterprise-template-detail",
    ),
    path("api-usage/", enterprise_views.EnterpriseApiUsageView.as_view(), name="enterprise-api-usage"),
    path("user-usage/", enterprise_views.EnterpriseUserUsageView.as_view(), name="enterprise-user-usage"),
]
