#!/usr/bin/env bash
# Deploy the app to DigitalOcean App Platform.
# Usage: ./scripts/deploy.sh [prod|staging]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env.ops"

if [ ! -f "$ENV_FILE" ]; then
    echo "Error: .env.ops not found. Create it with PROD_APP_ID and STAGING_APP_ID."
    exit 1
fi

source "$ENV_FILE"

ENV="${1:-staging}"

if [ "$ENV" = "prod" ]; then
    APP_ID="${PROD_APP_ID:?PROD_APP_ID not set in .env.ops}"
    echo "Deploying to PRODUCTION..."
elif [ "$ENV" = "staging" ]; then
    APP_ID="${STAGING_APP_ID:?STAGING_APP_ID not set in .env.ops}"
    echo "Deploying to staging..."
else
    echo "Usage: $0 [prod|staging]"
    exit 1
fi

doctl apps create-deployment "$APP_ID"
echo "Deployment triggered for $ENV (app: $APP_ID)"
