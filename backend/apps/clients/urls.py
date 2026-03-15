from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("clients", views.ClientViewSet)
router.register("projects", views.ProjectViewSet)
router.register("chains-of-title", views.ChainOfTitleViewSet)

urlpatterns = router.urls
