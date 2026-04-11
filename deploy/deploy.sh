#!/usr/bin/env bash
#
# LandShark deployment script — run on the VPS as root.
# Usage: ./deploy/deploy.sh
#
set -euo pipefail

APP_DIR="/opt/landshark"
VENV="$APP_DIR/venv"
FRONTEND_DIR="/var/www/landshark/frontend"

# Ensure git trusts the repo directory
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

echo "==> Pulling latest code..."
cd "$APP_DIR"
git pull origin main

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
