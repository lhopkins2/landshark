#!/usr/bin/env bash
#
# LandShark deployment script — run on the VPS as the landshark user.
# Usage: ./deploy/deploy.sh
#
set -euo pipefail

APP_DIR="/opt/landshark"
VENV="$APP_DIR/venv"
FRONTEND_DIR="/var/www/landshark/frontend"

echo "==> Pulling latest code..."
cd "$APP_DIR"
git pull origin main

echo "==> Installing Python dependencies..."
"$VENV/bin/pip" install -e "./backend" --quiet

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

echo "==> Restarting services..."
sudo systemctl restart landshark-web
sudo systemctl restart landshark-worker

echo "==> Reloading Nginx..."
sudo systemctl reload nginx

echo ""
echo "=== Deploy complete ==="
echo "Web:    $(systemctl is-active landshark-web)"
echo "Worker: $(systemctl is-active landshark-worker)"
echo "Nginx:  $(systemctl is-active nginx)"
