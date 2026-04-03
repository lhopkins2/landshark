class OrgScopedViewMixin:
    """Mixin that filters querysets to the user's organization."""

    org_field = "organization"

    def get_org(self):
        user = self.request.user
        if getattr(user, "is_developer", False):
            return None  # developers see everything
        membership = getattr(user, "membership", None)
        return membership.organization if membership else None

    def get_queryset(self):
        qs = super().get_queryset()
        org = self.get_org()
        if org is None:
            return qs
        return qs.filter(**{self.org_field: org})
