from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from .models import Membership
from .permissions import IsOrgAdmin
from .serializers import (
    CreateMemberSerializer,
    LoginSerializer,
    MemberSerializer,
    UpdateMemberSerializer,
    UserSerializer,
)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        refresh = RefreshToken.for_user(user)
        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": UserSerializer(user).data,
        })


class TokenRefreshAPIView(TokenRefreshView):
    pass


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response(status=status.HTTP_205_RESET_CONTENT)
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except Exception:
            return Response(
                {"detail": "Token could not be blacklisted. You are logged out locally."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_205_RESET_CONTENT)


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class OrgMemberListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsOrgAdmin]

    def _get_org(self, user):
        try:
            return user.membership.organization
        except Membership.DoesNotExist:
            return None

    def get(self, request):
        if getattr(request.user, "is_developer", False) and not self._get_org(request.user):
            # Developers without a membership see all members
            members = Membership.objects.select_related("user", "organization").order_by("user__email")
        else:
            org = self._get_org(request.user)
            if not org:
                return Response([], status=status.HTTP_200_OK)
            members = Membership.objects.filter(organization=org).select_related("user").order_by("user__email")
        return Response(MemberSerializer(members, many=True).data)

    def post(self, request):
        org = self._get_org(request.user)
        if not org:
            return Response({"detail": "No organization found."}, status=status.HTTP_400_BAD_REQUEST)
        serializer = CreateMemberSerializer(
            data=request.data, context={"organization": org, "request_user": request.user}
        )
        serializer.is_valid(raise_exception=True)
        membership = serializer.save()
        return Response(MemberSerializer(membership).data, status=status.HTTP_201_CREATED)


class OrgMemberDetailView(APIView):
    permission_classes = [IsAuthenticated, IsOrgAdmin]

    def _get_membership(self, request, pk):
        """Get a membership by its UUID PK, scoped to the requesting user's org."""
        try:
            membership = Membership.objects.select_related("user", "organization").get(pk=pk)
        except Membership.DoesNotExist:
            return None
        # Developers can access any membership
        if getattr(request.user, "is_developer", False):
            return membership
        # Non-developers can only access members in their own org
        try:
            requesting_org = request.user.membership.organization
        except Membership.DoesNotExist:
            return None
        if membership.organization != requesting_org:
            return None
        return membership

    def get(self, request, pk):
        membership = self._get_membership(request, pk)
        if not membership:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(MemberSerializer(membership).data)

    def patch(self, request, pk):
        membership = self._get_membership(request, pk)
        if not membership:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        # Prevent self-modification of role or active status
        if membership.user == request.user:
            if request.data.get("role") == "operator":
                return Response({"detail": "You cannot change your own role."}, status=status.HTTP_400_BAD_REQUEST)
            if request.data.get("is_active") is False:
                return Response(
                    {"detail": "You cannot deactivate yourself."}, status=status.HTTP_400_BAD_REQUEST
                )
        serializer = UpdateMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.update(membership, serializer.validated_data)
        return Response(MemberSerializer(membership).data)

    def delete(self, request, pk):
        membership = self._get_membership(request, pk)
        if not membership:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if membership.user == request.user:
            return Response({"detail": "You cannot deactivate yourself."}, status=status.HTTP_400_BAD_REQUEST)
        membership.user.is_active = False
        membership.user.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)
