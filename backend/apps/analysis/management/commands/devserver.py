"""Development server that auto-starts the Django-Q2 worker alongside runserver.

Usage:
    python manage.py devserver [port]       # default port 8001
    python manage.py devserver 8001 --noreload
"""

import atexit
import os
import signal
import subprocess
import sys
import threading
import time

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Start the Django dev server with a co-managed qcluster worker process."

    def add_arguments(self, parser):
        parser.add_argument("addrport", nargs="?", default="8001", help="Port or addr:port (default 8001)")
        parser.add_argument("--noreload", action="store_true", help="Disable auto-reloader")

    def handle(self, *args, **options):
        if not settings.DEBUG:
            self.stderr.write(self.style.ERROR("devserver is for development only (DEBUG must be True)."))
            sys.exit(1)

        # Django's autoreloader spawns a child process with RUN_MAIN=true.
        # Only start qcluster in the outer (reloader) process to avoid duplicates.
        is_reloader_child = os.environ.get("RUN_MAIN") == "true"

        if not is_reloader_child:
            self._start_worker()

        # Delegate to runserver with the same arguments
        runserver_args = [options["addrport"]]
        runserver_kwargs = {}
        if options["noreload"]:
            runserver_kwargs["use_reloader"] = False

        call_command("runserver", *runserver_args, **runserver_kwargs)

    def _start_worker(self):
        """Spawn qcluster as a subprocess, with monitoring and cleanup."""
        from apps.analysis.utils import is_qcluster_running

        if is_qcluster_running():
            self.stdout.write(self.style.SUCCESS("qcluster is already running — skipping spawn."))
            return

        self.stdout.write(self.style.SUCCESS("Starting qcluster worker..."))

        manage_py = os.path.join(settings.BASE_DIR, "manage.py")

        def spawn_worker():
            return subprocess.Popen(
                [sys.executable, manage_py, "qcluster"],
                stdout=sys.stdout,
                stderr=sys.stderr,
                cwd=str(settings.BASE_DIR),
            )

        # Use a list so the reference can be updated from the monitor thread
        worker = [spawn_worker()]

        def cleanup():
            p = worker[0]
            if p and p.poll() is None:
                p.terminate()
                try:
                    p.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    p.kill()

        atexit.register(cleanup)

        # Also handle SIGTERM so cleanup runs when the process is killed
        prev_handler = signal.getsignal(signal.SIGTERM)

        def sigterm_handler(signum, frame):
            cleanup()
            if callable(prev_handler) and prev_handler not in (signal.SIG_DFL, signal.SIG_IGN):
                prev_handler(signum, frame)
            sys.exit(0)

        signal.signal(signal.SIGTERM, sigterm_handler)

        # Monitor thread: respawn worker if it crashes, with exponential backoff
        MAX_FAILURES = 5

        def monitor():
            consecutive_failures = 0
            while True:
                time.sleep(10)
                p = worker[0]
                if p.poll() is None:
                    # Worker is healthy — reset failure counter
                    consecutive_failures = 0
                    continue

                consecutive_failures += 1
                if consecutive_failures > MAX_FAILURES:
                    self.stderr.write(self.style.ERROR(
                        f"qcluster has crashed {consecutive_failures} times in a row. "
                        "Giving up — check for errors above and restart manually."
                    ))
                    return

                backoff = min(10 * consecutive_failures, 60)
                self.stderr.write(self.style.WARNING(
                    f"qcluster exited (code {p.returncode}). "
                    f"Respawning in {backoff}s (attempt {consecutive_failures}/{MAX_FAILURES})..."
                ))
                time.sleep(backoff)
                try:
                    worker[0] = spawn_worker()
                except Exception as e:
                    self.stderr.write(self.style.ERROR(f"Failed to respawn qcluster: {e}"))

        t = threading.Thread(target=monitor, daemon=True)
        t.start()
