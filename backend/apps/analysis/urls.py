from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("form-templates", views.FormTemplateViewSet)
router.register("analyses", views.COTAnalysisViewSet, basename="cotanalysis")

urlpatterns = [
    path("analysis/settings/", views.UserSettingsView.as_view(), name="analysis-settings"),
    path("analysis/models/", views.ListModelsView.as_view(), name="list-models"),
    path("analysis/run/", views.RunAnalysisView.as_view(), name="run-analysis"),
    path("analysis/cancel/<uuid:pk>/", views.CancelAnalysisView.as_view(), name="cancel-analysis"),
    path("analysis/debug/<uuid:pk>/", views.AnalysisDebugView.as_view(), name="analysis-debug"),
    path("analysis/org-settings/", views.OrgSettingsView.as_view(), name="org-analysis-settings"),
    path("dashboard/stats/", views.DashboardStatsView.as_view(), name="dashboard-stats"),
    path("analysis/worker-health/", views.WorkerHealthView.as_view(), name="worker-health"),
] + router.urls
