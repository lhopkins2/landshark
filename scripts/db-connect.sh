#!/usr/bin/env bash
# Connect to a managed PostgreSQL database.
# Usage: ./scripts/db-connect.sh [prod|staging]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../.env.ops"

ENV="${1:-staging}"

if [ "$ENV" = "prod" ]; then
    DB_ID="${PROD_DB_ID:?PROD_DB_ID not set in .env.ops}"
    echo "Connecting to PRODUCTION database..."
elif [ "$ENV" = "staging" ]; then
    DB_ID="${STAGING_DB_ID:?STAGING_DB_ID not set in .env.ops}"
    echo "Connecting to staging database..."
else
    echo "Usage: $0 [prod|staging]"
    exit 1
fi

# Get connection details and connect
CONN=$(doctl databases connection "$DB_ID" --format URI --no-header)
echo "Connecting via: psql ..."
psql "$CONN"
