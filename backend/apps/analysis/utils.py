"""Shared utility functions for the analysis app."""

import datetime
import logging

from django.utils import timezone

logger = logging.getLogger(__name__)

# Maximum time (seconds) an analysis can stay in "processing" before being auto-failed.
STALE_ANALYSIS_TIMEOUT = 660  # 11 minutes (slightly above Q_CLUSTER retry of 660s)


def is_qcluster_running():
    """Check if at least one Django-Q2 cluster is alive.

    Uses Stat.get_all() which reads the cluster heartbeat from the ORM broker.
    Falls back to checking if any tasks have been processed recently.
    """
    try:
        from django_q.status import Stat

        stats = Stat.get_all()
        if len(stats) > 0:
            return True
    except Exception:
        pass

    # Fallback: check if any task was processed in the last 5 minutes
    # (covers cases where Stat doesn't detect the cluster but it's working)
    try:
        from django_q.models import Success

        cutoff = timezone.now() - datetime.timedelta(minutes=5)
        if Success.objects.filter(stopped__gte=cutoff).exists():
            return True
    except Exception:
        pass

    return False


def recover_stale_analyses():
    """Mark analyses stuck in 'processing' beyond the timeout as failed.

    This is called on every analysis poll so that stuck tasks are cleaned up
    automatically even if no one is actively monitoring.
    """
    from .models import COTAnalysis

    cutoff = timezone.now() - datetime.timedelta(seconds=STALE_ANALYSIS_TIMEOUT)
    stale = COTAnalysis.objects.filter(
        status=COTAnalysis.Status.PROCESSING,
        created_at__lt=cutoff,
    )
    count = stale.update(
        status=COTAnalysis.Status.FAILED,
        progress_step=COTAnalysis.ProgressStep.FAILED,
        error_message="Analysis timed out — the background worker may not have been running. Please try again.",
    )
    if count:
        logger.warning("Auto-failed %d stale analyses that exceeded %ds timeout.", count, STALE_ANALYSIS_TIMEOUT)
    return count
