from django.urls import path

from . import views

urlpatterns = [
    path("login/", views.LoginView.as_view(), name="login"),
    path("token/refresh/", views.TokenRefreshAPIView.as_view(), name="token_refresh"),
    path("logout/", views.LogoutView.as_view(), name="logout"),
    path("me/", views.CurrentUserView.as_view(), name="current_user"),
    path("org/members/", views.OrgMemberListCreateView.as_view(), name="org_member_list"),
    path("org/members/<uuid:pk>/", views.OrgMemberDetailView.as_view(), name="org_member_detail"),
]
