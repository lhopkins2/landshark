#!/usr/bin/env python3
"""LandShark automated backup — runs every 6 hours via systemd timer.

Backs up:
  1. PostgreSQL database → gzipped SQL dump → DO Spaces backup bucket
  2. Media files (local or primary Spaces bucket) → DO Spaces backup bucket

Prunes DB dumps older than 30 days.
Writes status JSON to /var/log/landshark/backup-status.json.
"""

import gzip
import json
import logging
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

import boto3

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
ENV_FILE = os.environ.get("BACKUP_ENV_FILE", "/opt/landshark/.env")
STATUS_FILE = Path(os.environ.get("BACKUP_STATUS_FILE", "/var/log/landshark/backup-status.json"))
MEDIA_ROOT = Path("/opt/landshark/backend/media")
RETENTION_DAYS = 30
DB_PREFIX = "db/"
MEDIA_PREFIX = "media/"

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("backup")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def load_env(path):
    """Parse a .env file into a dict (simple key=value, ignores comments)."""
    env = {}
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                env[key.strip()] = value.strip()
    except FileNotFoundError:
        log.warning("Env file not found: %s — falling back to os.environ", path)
    # Overlay with actual environment (systemd EnvironmentFile sets these)
    env.update(os.environ)
    return env


def parse_database_url(url):
    """Parse DATABASE_URL into pg_dump connection args."""
    parsed = urlparse(url)
    return {
        "host": parsed.hostname or "localhost",
        "port": str(parsed.port or 5432),
        "user": parsed.username or "landshark",
        "dbname": parsed.path.lstrip("/") or "landshark",
        "password": parsed.password or "",
    }


def get_s3_client(env, prefix="BACKUP_SPACES"):
    """Create a boto3 S3 client from env vars with the given prefix."""
    return boto3.client(
        "s3",
        region_name=env.get(f"{prefix}_REGION", "sfo3"),
        endpoint_url=env.get(f"{prefix}_ENDPOINT", ""),
        aws_access_key_id=env.get(f"{prefix}_KEY", ""),
        aws_secret_access_key=env.get(f"{prefix}_SECRET", ""),
    )


def write_status(success, details):
    """Write JSON status for the health-check endpoint."""
    status = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "success": success,
        "details": details,
    }
    try:
        STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
        STATUS_FILE.write_text(json.dumps(status, indent=2))
    except OSError as e:
        log.error("Failed to write status file: %s", e)


# ---------------------------------------------------------------------------
# Backup steps
# ---------------------------------------------------------------------------
def backup_database(client, bucket, env):
    """pg_dump → gzip → upload to backup bucket."""
    db = parse_database_url(env.get("DATABASE_URL", ""))
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M%S")
    key = f"{DB_PREFIX}{timestamp}.sql.gz"

    log.info("Dumping database %s@%s:%s/%s ...", db["user"], db["host"], db["port"], db["dbname"])

    pg_env = os.environ.copy()
    pg_env["PGPASSWORD"] = db["password"]

    with tempfile.NamedTemporaryFile(suffix=".sql.gz", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        # pg_dump → gzip → temp file
        pg_dump = subprocess.Popen(
            [
                "pg_dump",
                "-h", db["host"],
                "-p", db["port"],
                "-U", db["user"],
                "-d", db["dbname"],
                "--no-owner",
                "--no-acl",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=pg_env,
        )

        with open(tmp_path, "wb") as f:
            with gzip.open(f, "wb", compresslevel=6) as gz:
                while True:
                    chunk = pg_dump.stdout.read(1024 * 1024)  # 1MB chunks
                    if not chunk:
                        break
                    gz.write(chunk)

        pg_dump.wait()
        if pg_dump.returncode != 0:
            stderr = pg_dump.stderr.read().decode()
            raise RuntimeError(f"pg_dump failed (exit {pg_dump.returncode}): {stderr}")

        size_mb = os.path.getsize(tmp_path) / (1024 * 1024)
        log.info("Uploading %s (%.1f MB) ...", key, size_mb)
        client.upload_file(tmp_path, bucket, key)
        log.info("Database backup complete: %s", key)
        return key, size_mb

    finally:
        os.unlink(tmp_path)


def sync_media_local(client, bucket):
    """Sync local media/ directory to backup bucket."""
    if not MEDIA_ROOT.is_dir():
        log.info("No local media directory at %s — skipping media sync.", MEDIA_ROOT)
        return 0

    # List existing remote objects for comparison
    remote_objects = {}
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=MEDIA_PREFIX):
        for obj in page.get("Contents", []):
            remote_objects[obj["Key"]] = obj["Size"]

    uploaded = 0
    for local_path in MEDIA_ROOT.rglob("*"):
        if not local_path.is_file():
            continue
        relative = local_path.relative_to(MEDIA_ROOT)
        remote_key = f"{MEDIA_PREFIX}{relative}"
        local_size = local_path.stat().st_size

        # Skip if remote has same key and size
        if remote_key in remote_objects and remote_objects[remote_key] == local_size:
            continue

        log.info("Uploading %s (%d bytes)", remote_key, local_size)
        client.upload_file(str(local_path), bucket, remote_key)
        uploaded += 1

    log.info("Media sync complete: %d files uploaded.", uploaded)
    return uploaded


def sync_media_spaces(client, bucket, env):
    """Copy media from primary DO Spaces bucket to backup bucket."""
    primary = get_s3_client(env, prefix="DO_SPACES")
    primary_bucket = env.get("DO_SPACES_BUCKET", "")

    if not primary_bucket:
        log.warning("DO_SPACES_BUCKET not set — cannot sync from primary Spaces.")
        return 0

    # List objects in primary bucket
    primary_objects = {}
    paginator = primary.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=primary_bucket):
        for obj in page.get("Contents", []):
            primary_objects[obj["Key"]] = obj["Size"]

    # List objects in backup bucket media/ prefix
    backup_objects = {}
    backup_paginator = client.get_paginator("list_objects_v2")
    for page in backup_paginator.paginate(Bucket=bucket, Prefix=MEDIA_PREFIX):
        for obj in page.get("Contents", []):
            # Strip prefix for comparison
            backup_objects[obj["Key"]] = obj["Size"]

    uploaded = 0
    for key, size in primary_objects.items():
        backup_key = f"{MEDIA_PREFIX}{key}"
        if backup_key in backup_objects and backup_objects[backup_key] == size:
            continue

        log.info("Copying %s → %s (%d bytes)", key, backup_key, size)
        # Download from primary, upload to backup (cross-region, can't server-side copy)
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp_path = tmp.name
        try:
            primary.download_file(primary_bucket, key, tmp_path)
            client.upload_file(tmp_path, bucket, backup_key)
            uploaded += 1
        finally:
            os.unlink(tmp_path)

    log.info("Spaces-to-Spaces media sync complete: %d files copied.", uploaded)
    return uploaded


def prune_old_backups(client, bucket):
    """Delete DB dumps older than RETENTION_DAYS."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
    pruned = 0

    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=DB_PREFIX):
        for obj in page.get("Contents", []):
            if obj["LastModified"].replace(tzinfo=timezone.utc) < cutoff:
                log.info("Pruning old backup: %s", obj["Key"])
                client.delete_object(Bucket=bucket, Key=obj["Key"])
                pruned += 1

    if pruned:
        log.info("Pruned %d backups older than %d days.", pruned, RETENTION_DAYS)
    return pruned


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    log.info("=" * 50)
    log.info("LandShark Backup starting")
    log.info("=" * 50)

    env = load_env(ENV_FILE)

    # Validate required backup credentials
    backup_key = env.get("BACKUP_SPACES_KEY", "")
    backup_bucket = env.get("BACKUP_SPACES_BUCKET", "landshark-backups")
    if not backup_key:
        msg = "BACKUP_SPACES_KEY not set — cannot run backup."
        log.error(msg)
        write_status(False, {"error": msg})
        sys.exit(1)

    client = get_s3_client(env, prefix="BACKUP_SPACES")
    details = {}

    # Step 1: Database backup
    log.info("[1/3] Backing up database...")
    db_url = env.get("DATABASE_URL", "")
    if db_url:
        db_key, db_size = backup_database(client, backup_bucket, env)
        details["db_dump"] = db_key
        details["db_size_mb"] = round(db_size, 2)
    else:
        log.warning("DATABASE_URL not set — skipping database backup.")
        details["db_dump"] = None

    # Step 2: Media sync
    log.info("[2/3] Syncing media files...")
    primary_spaces_key = env.get("DO_SPACES_KEY", "")
    if primary_spaces_key:
        files_synced = sync_media_spaces(client, backup_bucket, env)
        details["media_source"] = "spaces"
    else:
        files_synced = sync_media_local(client, backup_bucket)
        details["media_source"] = "local"
    details["media_files_uploaded"] = files_synced

    # Step 3: Prune old backups
    log.info("[3/3] Pruning old backups...")
    pruned = prune_old_backups(client, backup_bucket)
    details["pruned_count"] = pruned

    log.info("Backup complete.")
    write_status(True, details)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log.exception("Backup failed: %s", e)
        write_status(False, {"error": str(e)})
        sys.exit(1)
