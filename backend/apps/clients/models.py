from django.db import models

from apps.core.models import TimestampedModel


class Client(TimestampedModel):
    class ClientType(models.TextChoices):
        LAW_FIRM = "law_firm", "Law Firm"
        LENDER = "lender", "Lender"
        REAL_ESTATE_AGENCY = "real_estate_agency", "Real Estate Agency"
        INDIVIDUAL = "individual", "Individual"
        OTHER = "other", "Other"

    name = models.CharField(max_length=255)
    client_type = models.CharField(max_length=20, choices=ClientType.choices, default=ClientType.LAW_FIRM)
    primary_contact_name = models.CharField(max_length=255, blank=True, default="")
    primary_contact_email = models.EmailField(blank=True, default="")
    primary_contact_phone = models.CharField(max_length=20, blank=True, default="")
    city = models.CharField(max_length=100, blank=True, default="")
    state = models.CharField(max_length=50, blank=True, default="")
    zip_code = models.CharField(max_length=20, blank=True, default="")
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True, default="")

    class Meta(TimestampedModel.Meta):
        pass

    def __str__(self):
        return self.name


class Project(TimestampedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        ON_HOLD = "on_hold", "On Hold"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="projects")
    name = models.CharField(max_length=255)
    reference_number = models.CharField(max_length=100, blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    description = models.TextField(blank=True, default="")
    notes = models.TextField(blank=True, default="")

    class Meta(TimestampedModel.Meta):
        pass

    def __str__(self):
        return self.name


class ChainOfTitle(TimestampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        IN_PROGRESS = "in_progress", "In Progress"
        COMPLETE = "complete", "Complete"

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="chains_of_title")
    property_address = models.CharField(max_length=255, blank=True, default="")
    county = models.CharField(max_length=100, blank=True, default="")
    state = models.CharField(max_length=50, blank=True, default="")
    parcel_number = models.CharField(max_length=100, blank=True, default="")
    legal_description = models.TextField(blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    notes = models.TextField(blank=True, default="")

    class Meta(TimestampedModel.Meta):
        verbose_name_plural = "chains of title"

    def __str__(self):
        return self.property_address or f"Chain {self.id}"
