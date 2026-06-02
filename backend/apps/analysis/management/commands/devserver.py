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

        # Django autoreloader sets RUN_MAIN=true in the child; only the outer process spawns qcluster.
        is_reloader_child = os.environ.get("RUN_MAIN") == "true"

        if not is_reloader_child:
            self._start_worker()

        runserver_args = [options["addrport"]]
        runserver_kwargs = {}
        if options["noreload"]:
            runserver_kwargs["use_reloader"] = False

        call_command("runserver", *runserver_args, **runserver_kwargs)

    @staticmethod
    def _running_qcluster_pids():
        """Return PIDs of real `python ... manage.py qcluster` processes.

        Tighter than `pgrep -f manage.py qcluster`, which matches lingering
        shell commands (e.g. `pkill -f "manage.py qcluster"`) and causes
        devserver to falsely skip the spawn.
        """
        own_pids = {os.getpid(), os.getppid()}
        pids = []
        try:
            result = subprocess.run(
                ["ps", "-eo", "pid=,command="],
                capture_output=True, text=True, timeout=5,
            )
            for line in result.stdout.splitlines():
                parts = line.strip().split(None, 1)
                if len(parts) != 2:
                    continue
                pid_str, cmd = parts
                try:
                    pid = int(pid_str)
                except ValueError:
                    continue
                if pid in own_pids:
                    continue
                # Require an actual python invocation, not a shell containing the words.
                if "python" not in cmd.lower():
                    continue
                if "manage.py" not in cmd or "qcluster" not in cmd:
                    continue
                pids.append(pid)
        except Exception:
            pass
        return pids

    def _start_worker(self):
        """Spawn qcluster as a subprocess, with respawn-on-crash and cleanup on exit."""
        existing = self._running_qcluster_pids()
        if existing:
            self.stdout.write(self.style.SUCCESS(
                f"qcluster already running (PID {existing[0]}) — reusing it."
            ))
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

        # List wrapper lets the monitor thread swap in a fresh process after a crash.
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

        # SIGTERM doesn't trigger atexit on its own; chain a handler so cleanup runs on kill.
        prev_handler = signal.getsignal(signal.SIGTERM)

        def sigterm_handler(signum, frame):
            cleanup()
            if callable(prev_handler) and prev_handler not in (signal.SIG_DFL, signal.SIG_IGN):
                prev_handler(signum, frame)
            sys.exit(0)

        signal.signal(signal.SIGTERM, sigterm_handler)

        max_failures = 5

        def monitor():
            consecutive_failures = 0
            while True:
                time.sleep(10)
                p = worker[0]
                if p.poll() is None:
                    consecutive_failures = 0
                    continue

                consecutive_failures += 1
                if consecutive_failures > max_failures:
                    self.stderr.write(self.style.ERROR(
                        f"qcluster has crashed {consecutive_failures} times in a row. "
                        "Giving up — check for errors above and restart manually."
                    ))
                    return

                backoff = min(10 * consecutive_failures, 60)
                self.stderr.write(self.style.WARNING(
                    f"qcluster exited (code {p.returncode}). "
                    f"Respawning in {backoff}s (attempt {consecutive_failures}/{max_failures})..."
                ))
                time.sleep(backoff)
                try:
                    worker[0] = spawn_worker()
                except Exception as e:
                    self.stderr.write(self.style.ERROR(f"Failed to respawn qcluster: {e}"))

        t = threading.Thread(target=monitor, daemon=True)
        t.start()
