#!/usr/bin/env bash
# Run an immediate backup of the production database and files to Backblaze B2.
# Requires: rclone configured with 'b2' and 'do-spaces' remotes.
# Usage: ./scripts/backup-now.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../.env.ops"

TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
B2_BUCKET="${B2_BUCKET:-landshark-backups}"
SPACES_BUCKET="${DO_SPACES_BUCKET:-landshark-prod}"

echo "=== LandShark Backup — $TIMESTAMP ==="

# 1. Database backup
echo ""
echo "[1/2] Backing up database..."
DB_ID="${PROD_DB_ID:?PROD_DB_ID not set in .env.ops}"
CONN=$(doctl databases connection "$DB_ID" --format URI --no-header)
pg_dump "$CONN" | gzip | rclone rcat "b2:${B2_BUCKET}/db/${TIMESTAMP}.sql.gz"
echo "  Database backed up to b2:${B2_BUCKET}/db/${TIMESTAMP}.sql.gz"

# 2. File storage sync
echo ""
echo "[2/2] Syncing file storage..."
rclone sync "do-spaces:${SPACES_BUCKET}" "b2:${B2_BUCKET}/files/" --transfers 16 --progress
echo "  Files synced to b2:${B2_BUCKET}/files/"

echo ""
echo "=== Backup complete ==="
