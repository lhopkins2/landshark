import logging
import sys

from django.apps import AppConfig

logger = logging.getLogger(__name__)


class AnalysisConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.analysis"
    verbose_name = "Analysis"

    def ready(self) -> None:
        """Mark PROCESSING analyses older than 30s as FAILED on server boot.

        Restarts wipe in-memory task state, so without this an interrupted
        analysis sits in PROCESSING forever and the Analyze button feels broken.
        Skipped for qcluster startup (races with picking up fresh work).
        """
        argv = sys.argv
        is_server_boot = any(arg in argv for arg in ("runserver", "devserver", "gunicorn"))
        if not is_server_boot:
            return
        # Django autoreloader spawns a child with RUN_MAIN=true; only the child should clean up.
        import os
        if "runserver" in argv and os.environ.get("RUN_MAIN") != "true":
            return

        try:
            from .utils import recover_stale_analyses_at_startup
            recovered = recover_stale_analyses_at_startup()
            if recovered:
                logger.warning(
                    "Startup recovery: auto-failed %d stale PROCESSING analyses (worker died mid-task).",
                    recovered,
                )
            else:
                logger.info("Startup recovery: no stale analyses to clean up.")
        except Exception:
            logger.exception("Startup recovery for stale analyses failed (non-fatal).")
