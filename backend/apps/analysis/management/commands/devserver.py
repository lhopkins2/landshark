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
            self._apply_pending_migrations()
            self._start_worker()

        runserver_args = [options["addrport"]]
        runserver_kwargs = {}
        if options["noreload"]:
            runserver_kwargs["use_reloader"] = False

        call_command("runserver", *runserver_args, **runserver_kwargs)

    def _apply_pending_migrations(self):
        """Apply any unapplied migrations on startup.

        Prevents the web/worker from running against a stale schema after a
        `git pull` that added migrations (the cause of 'no such column' /
        'fields do not exist in this model' errors in dev).
        """
        self.stdout.write(self.style.SUCCESS("Checking for pending migrations..."))
        try:
            call_command("migrate", interactive=False, verbosity=1)
        except Exception as e:
            self.stderr.write(self.style.ERROR(f"Auto-migrate failed: {e}"))

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

        # The qcluster worker does NOT auto-reload on its own (unlike runserver),
        # so we watch backend source and restart it on change. Without this, the
        # worker keeps a stale model/code in memory after an edit — the cause of
        # "fields do not exist in this model" errors mid-session.
        watch_dirs = [os.path.join(settings.BASE_DIR, d) for d in ("apps", "config")]

        def snapshot():
            snap = {}
            for root in watch_dirs:
                for dirpath, dirnames, filenames in os.walk(root):
                    dirnames[:] = [d for d in dirnames if d != "__pycache__"]
                    for fn in filenames:
                        if fn.endswith(".py"):
                            fp = os.path.join(dirpath, fn)
                            try:
                                snap[fp] = os.path.getmtime(fp)
                            except OSError:
                                pass
            return snap

        def restart_worker():
            p = worker[0]
            if p and p.poll() is None:
                p.terminate()
                try:
                    p.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    p.kill()
            worker[0] = spawn_worker()

        max_failures = 5

        def monitor():
            last_snapshot = snapshot()
            consecutive_failures = 0
            while True:
                time.sleep(1.5)
                p = worker[0]

                # --- crash respawn (with backoff) ---
                if p.poll() is not None:
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
                    last_snapshot = snapshot()
                    continue
                consecutive_failures = 0

                # --- reload on source change ---
                current = snapshot()
                changed = [f for f in current if current.get(f) != last_snapshot.get(f)]
                changed += [f for f in last_snapshot if f not in current]
                if changed:
                    if any(f"{os.sep}migrations{os.sep}" in f for f in changed):
                        self.stdout.write(self.style.WARNING(
                            "Migration change detected — applying migrations before worker restart..."
                        ))
                        try:
                            subprocess.run(
                                [sys.executable, manage_py, "migrate", "--noinput"],
                                cwd=str(settings.BASE_DIR), timeout=120,
                            )
                        except Exception as e:
                            self.stderr.write(self.style.ERROR(f"Auto-migrate failed: {e}"))
                    self.stdout.write(self.style.SUCCESS(
                        "Code change detected — restarting qcluster worker with fresh code..."
                    ))
                    restart_worker()
                    last_snapshot = current

        t = threading.Thread(target=monitor, daemon=True)
        t.start()
