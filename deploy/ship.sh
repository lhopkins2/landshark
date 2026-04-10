#!/usr/bin/env bash
# Ship: commit, push, and deploy to the LandShark VPS in one command.
#
# Usage:
#   ./deploy/ship.sh                     # auto-generates commit message
#   ./deploy/ship.sh "fix upload bug"    # custom commit message

set -euo pipefail

SERVER="root@45.55.48.26"
SSH_KEY="~/.ssh/lshark"
DEPLOY_CMD="bash /opt/landshark/deploy/deploy.sh"

cd "$(git rev-parse --show-toplevel)"

# Stage all changes
git add -A

# Check if there's anything to commit
if git diff --cached --quiet; then
  echo "No changes to commit — deploying latest pushed code."
else
  MSG="${1:-$(git diff --cached --stat | tail -1 | sed 's/^ *//')}"
  git commit -m "$MSG"
  echo "Committed: $MSG"
fi

# Push
echo "Pushing to origin..."
git push origin main

# Deploy
echo "Deploying to VPS..."
ssh -i "$SSH_KEY" "$SERVER" "$DEPLOY_CMD"

echo ""
echo "Shipped! Live at https://45-55-48-26.nip.io"
