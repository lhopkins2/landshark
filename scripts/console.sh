#!/usr/bin/env bash
# Run a one-off command on DigitalOcean App Platform.
# Usage: ./scripts/console.sh [prod|staging] "python manage.py migrate"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../.env.ops"

ENV="${1:-staging}"
COMMAND="${2:-}"

if [ -z "$COMMAND" ]; then
    echo "Usage: $0 [prod|staging] \"command to run\""
    exit 1
fi

if [ "$ENV" = "prod" ]; then
    APP_ID="${PROD_APP_ID:?PROD_APP_ID not set in .env.ops}"
    echo "Running on PRODUCTION: $COMMAND"
elif [ "$ENV" = "staging" ]; then
    APP_ID="${STAGING_APP_ID:?STAGING_APP_ID not set in .env.ops}"
    echo "Running on staging: $COMMAND"
else
    echo "Usage: $0 [prod|staging] \"command to run\""
    exit 1
fi

doctl apps console "$APP_ID" --command "$COMMAND"
