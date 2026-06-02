import datetime
import logging

from django.utils import timezone

logger = logging.getLogger(__name__)

# Maximum time (seconds) an analysis can stay in "processing" before being auto-failed.
STALE_ANALYSIS_TIMEOUT = 660  # 11 minutes (slightly above Q_CLUSTER retry of 660s)


def is_qcluster_running() -> bool:
    """Detect a live Django-Q2 worker. Tries three strategies in order:

    1. Stat.get_all() — works with a shared cache (Redis/memcached/DB), not LocMemCache.
    2. Any Success row in the last 5 minutes — DB-based and cross-process safe.
    3. ORM-queue heuristic — empty queue gets the benefit of the doubt (stale-analysis
       timeout is the safety net); a queue with no locked tasks means the worker is dead.
    """
    try:
        from django_q.status import Stat

        if len(Stat.get_all()) > 0:
            return True
    except Exception:
        pass

    try:
        from django_q.models import Success

        cutoff = timezone.now() - datetime.timedelta(minutes=5)
        if Success.objects.filter(stopped__gte=cutoff).exists():
            return True
    except Exception:
        pass

    try:
        from django_q.models import OrmQ

        queued_count = OrmQ.objects.count()
        if queued_count == 0:
            return True

        locked_count = OrmQ.objects.filter(lock__isnull=False).count()
        if locked_count > 0:
            return True

        return False
    except Exception:
        pass

    return False


def recover_stale_analyses() -> int:
    """Mark analyses stuck in 'processing' beyond STALE_ANALYSIS_TIMEOUT as failed.

    Called from every analysis poll so stuck tasks self-heal without an admin watching.
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


# Anything PROCESSING from before this boot is stranded (worker is gone).
STARTUP_RECOVERY_CUTOFF_SECONDS = 30


def recover_stale_analyses_at_startup() -> int:
    """Mark all PROCESSING analyses older than STARTUP_RECOVERY_CUTOFF_SECONDS as failed.

    Called once per server boot from `AnalysisConfig.ready()`. Retryable work
    isn't lost — `run_analysis_task` resets FAILED → PROCESSING when qcluster picks it up.
    """
    from .models import COTAnalysis

    cutoff = timezone.now() - datetime.timedelta(seconds=STARTUP_RECOVERY_CUTOFF_SECONDS)
    stale = COTAnalysis.objects.filter(
        status=COTAnalysis.Status.PROCESSING,
        updated_at__lt=cutoff,
    )
    count = stale.update(
        status=COTAnalysis.Status.FAILED,
        progress_step=COTAnalysis.ProgressStep.FAILED,
        error_message=(
            "Analysis was interrupted by a backend restart. "
            "Please run the analysis again."
        ),
    )
    return count
