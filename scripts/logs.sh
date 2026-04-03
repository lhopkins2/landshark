#!/usr/bin/env bash
# View application logs from DigitalOcean App Platform.
# Usage: ./scripts/logs.sh [prod|staging] [--follow]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../.env.ops"

ENV="${1:-staging}"
shift || true

if [ "$ENV" = "prod" ]; then
    APP_ID="${PROD_APP_ID:?PROD_APP_ID not set in .env.ops}"
elif [ "$ENV" = "staging" ]; then
    APP_ID="${STAGING_APP_ID:?STAGING_APP_ID not set in .env.ops}"
else
    echo "Usage: $0 [prod|staging] [--follow]"
    exit 1
fi

EXTRA_ARGS=""
for arg in "$@"; do
    if [ "$arg" = "--follow" ] || [ "$arg" = "-f" ]; then
        EXTRA_ARGS="$EXTRA_ARGS --follow"
    fi
done

echo "Fetching logs for $ENV..."
doctl apps logs "$APP_ID" --type run $EXTRA_ARGS
