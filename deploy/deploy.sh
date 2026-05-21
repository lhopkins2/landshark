#!/usr/bin/env bash
#
# LandShark deployment script — run on the VPS as root.
# Usage: ./deploy/deploy.sh
#
set -euo pipefail

APP_DIR="/opt/landshark"
VENV="$APP_DIR/venv"
FRONTEND_DIR="/var/www/landshark/frontend"

# ---------------------------------------------------------------------------
# Ensure swap exists — prevents OOM kills during AI analysis on low-RAM hosts.
# Idempotent: skips creation if /swapfile already exists.
# ---------------------------------------------------------------------------
if [ ! -f /swapfile ]; then
  echo "==> Creating 4GB swap file..."
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  # Persist across reboots
  if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
  echo "    Swap created and enabled."
else
  # Make sure it's active (e.g. after a reboot that didn't mount it yet)
  swapon /swapfile 2>/dev/null || true
fi

# Ensure git trusts the repo directory
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

echo "==> Pulling latest code..."
cd "$APP_DIR"
git pull origin main

# Load .env so manage.py commands connect to PostgreSQL, not the SQLite fallback
set -a
# shellcheck source=/dev/null
source "$APP_DIR/.env"
set +a

echo "==> Installing Python dependencies..."
"$VENV/bin/pip" install -e "$APP_DIR/backend" --quiet

echo "==> Running migrations..."
cd "$APP_DIR/backend"
"$VENV/bin/python" manage.py migrate --noinput

echo "==> Collecting static files..."
"$VENV/bin/python" manage.py collectstatic --noinput --clear

echo "==> Building frontend..."
cd "$APP_DIR"
npm ci --prefix . --quiet
npm run build --prefix .

echo "==> Deploying frontend..."
rm -rf "$FRONTEND_DIR"/*
cp -r "$APP_DIR/dist/"* "$FRONTEND_DIR/"

echo "==> Fixing file ownership..."
chown -R landshark:landshark "$APP_DIR" "$FRONTEND_DIR"

echo "==> Updating systemd units..."
cp "$APP_DIR/deploy/landshark-backup.service" /etc/systemd/system/
cp "$APP_DIR/deploy/landshark-backup.timer" /etc/systemd/system/
systemctl daemon-reload

echo "==> Restarting services..."
systemctl restart landshark-web
systemctl restart landshark-worker

echo "==> Reloading Nginx..."
systemctl reload nginx

echo ""
echo "=== Deploy complete ==="
echo "Web:    $(systemctl is-active landshark-web)"
echo "Worker: $(systemctl is-active landshark-worker)"
echo "Nginx:  $(systemctl is-active nginx)"
