#!/usr/bin/env bash
#
# LandShark VPS initial setup script — run as root on a fresh Ubuntu 22.04/24.04 droplet.
# Usage: bash setup.sh yourdomain.com
#
set -euo pipefail

DOMAIN="${1:?Usage: bash setup.sh yourdomain.com}"
APP_DIR="/opt/landshark"
FRONTEND_DIR="/var/www/landshark/frontend"

echo "==> Updating system..."
apt update && apt upgrade -y

echo "==> Installing dependencies..."
apt install -y python3 python3-venv python3-pip python3-dev \
    postgresql postgresql-contrib \
    nginx certbot python3-certbot-nginx \
    git curl build-essential libpq-dev

echo "==> Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

echo "==> Creating landshark system user..."
useradd --system --shell /bin/bash --home "$APP_DIR" --create-home landshark || true

echo "==> Setting up PostgreSQL..."
sudo -u postgres psql -c "CREATE USER landshark WITH PASSWORD 'CHANGE_ME_NOW';" 2>/dev/null || echo "  (user already exists)"
sudo -u postgres psql -c "CREATE DATABASE landshark OWNER landshark;" 2>/dev/null || echo "  (database already exists)"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE landshark TO landshark;"

echo "==> Cloning repository..."
if [ ! -d "$APP_DIR/.git" ]; then
    git clone https://github.com/lhopkins2/landshark.git "$APP_DIR"
else
    echo "  (repo already cloned)"
fi
chown -R landshark:landshark "$APP_DIR"

echo "==> Creating Python venv..."
sudo -u landshark python3 -m venv "$APP_DIR/venv"
sudo -u landshark "$APP_DIR/venv/bin/pip" install --upgrade pip
sudo -u landshark "$APP_DIR/venv/bin/pip" install -e "$APP_DIR/backend"

echo "==> Creating directories..."
mkdir -p /var/log/landshark "$FRONTEND_DIR"
chown -R landshark:landshark /var/log/landshark "$FRONTEND_DIR"

echo "==> Setting up .env..."
if [ ! -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/deploy/.env.example" "$APP_DIR/.env"
    # Generate a Django secret key
    SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(50))")
    sed -i "s|DJANGO_SECRET_KEY=change-me-to-a-random-50-char-string|DJANGO_SECRET_KEY=$SECRET|" "$APP_DIR/.env"
    # Generate a Fernet encryption key
    FERNET=$("$APP_DIR/venv/bin/python" -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
    sed -i "s|FIELD_ENCRYPTION_KEY=change-me-generate-a-fernet-key|FIELD_ENCRYPTION_KEY=$FERNET|" "$APP_DIR/.env"
    # Set domain
    sed -i "s|staging.yourdomain.com|$DOMAIN|g" "$APP_DIR/.env"
    chown landshark:landshark "$APP_DIR/.env"
    chmod 600 "$APP_DIR/.env"
    echo "  >>> IMPORTANT: Edit /opt/landshark/.env and set the DATABASE_URL password!"
else
    echo "  (.env already exists)"
fi

echo "==> Installing systemd services..."
cp "$APP_DIR/deploy/landshark-web.service" /etc/systemd/system/
cp "$APP_DIR/deploy/landshark-worker.service" /etc/systemd/system/
cp "$APP_DIR/deploy/landshark-backup.service" /etc/systemd/system/
cp "$APP_DIR/deploy/landshark-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable landshark-web landshark-worker landshark-backup.timer

echo "==> Configuring Nginx..."
cp "$APP_DIR/deploy/nginx.conf" "/etc/nginx/sites-available/landshark"
sed -i "s|DOMAIN_PLACEHOLDER|$DOMAIN|g" "/etc/nginx/sites-available/landshark"
ln -sf "/etc/nginx/sites-available/landshark" "/etc/nginx/sites-enabled/landshark"
rm -f /etc/nginx/sites-enabled/default

echo "==> Setting up SSL with Let's Encrypt..."
echo "  (Nginx needs to start with HTTP-only first for Certbot)"
# Temporarily use HTTP-only config for certbot
cat > "/etc/nginx/sites-available/landshark" << NGINX
server {
    listen 80;
    server_name $DOMAIN;
    root $FRONTEND_DIR;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    location / {
        return 200 'Setting up...';
        add_header Content-Type text/plain;
    }
}
NGINX
nginx -t && systemctl restart nginx

echo ""
echo "============================================"
echo "  Initial setup complete!"
echo "============================================"
echo ""
echo "  Next steps (run these manually):"
echo ""
echo "  1. Edit the .env file:"
echo "     nano /opt/landshark/.env"
echo "     - Set the PostgreSQL password (update DATABASE_URL)"
echo "     - Optionally configure DO Spaces keys"
echo ""
echo "  2. Update the PostgreSQL password to match:"
echo "     sudo -u postgres psql -c \"ALTER USER landshark PASSWORD 'your-password';\""
echo ""
echo "  3. Get SSL certificate:"
echo "     certbot --nginx -d $DOMAIN"
echo ""
echo "  4. Restore the full Nginx config:"
echo "     cp $APP_DIR/deploy/nginx.conf /etc/nginx/sites-available/landshark"
echo "     sed -i 's|DOMAIN_PLACEHOLDER|$DOMAIN|g' /etc/nginx/sites-available/landshark"
echo "     nginx -t && systemctl reload nginx"
echo ""
echo "  5. Run the first deploy:"
echo "     sudo -u landshark bash $APP_DIR/deploy/deploy.sh"
echo ""
echo "  6. Create the admin user:"
echo "     cd /opt/landshark/backend"
echo "     sudo -u landshark /opt/landshark/venv/bin/python manage.py create_dev_superuser"
echo ""
