import datetime
import logging

from django.utils import timezone

logger = logging.getLogger(__name__)

# Maximum time (seconds) an analysis can stay in "processing" before being auto-failed.
STALE_ANALYSIS_TIMEOUT = 660  # 11 minutes (slightly above Q_CLUSTER retry of 660s)


def is_qcluster_running():
    """Check if at least one Django-Q2 cluster is alive.

    Detection strategy (all DB-based, cross-process safe):

    1. Stat.get_all() — Django-Q2's built-in stat reporting. Works when a shared
       cache backend (Redis, memcached, DB cache) is configured. Does NOT work with
       the default LocMemCache because each process has its own memory.

    2. Recent Success — a task completed in the DB recently, so the worker was alive.

    3. Queue heuristic (ORM broker) — if the task queue is empty, there is no evidence
       the worker is down, so we give the benefit of the doubt and allow the analysis
       to proceed. The stale-analysis recovery (11 min timeout) is the safety net.
       If tasks ARE queued but none are being picked up, the worker is likely dead.
    """
    # Strategy 1: Django-Q2 Stat (cache-based)
    try:
        from django_q.status import Stat

        if len(Stat.get_all()) > 0:
            return True
    except Exception:
        pass

    # Strategy 2: any task completed in the last 5 minutes (DB, cross-process)
    try:
        from django_q.models import Success

        cutoff = timezone.now() - datetime.timedelta(minutes=5)
        if Success.objects.filter(stopped__gte=cutoff).exists():
            return True
    except Exception:
        pass

    # Strategy 3: queue heuristic (ORM broker only)
    try:
        from django_q.models import OrmQ

        queued_count = OrmQ.objects.count()
        if queued_count == 0:
            # Queue is empty — no evidence worker is down. Allow the request.
            # If worker truly isn't running, the stale analysis timeout catches it.
            return True

        # Tasks are queued. If none are locked (being processed), the worker
        # isn't picking them up — it's likely dead.
        locked_count = OrmQ.objects.filter(lock__isnull=False).count()
        if locked_count > 0:
            # At least one task is being worked on
            return True

        # Unlocked tasks sitting in queue with no recent completions = worker is dead
        return False
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
