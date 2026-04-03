from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("document-folders", views.DocumentFolderViewSet)
router.register("documents", views.DocumentViewSet)

urlpatterns = router.urls
