#!/usr/bin/env bash
# Deploys the API with the cost guards that matter. Run from server/.
#   ./deploy.sh https://steinabi.com,https://www.steinabi.com
# --max-instances caps what a request flood can cost; --min-instances=1 keeps
# logins fast. Origins are comma separated and passed with a custom delimiter.
set -euo pipefail

ORIGINS="${1:?Usage: ./deploy.sh <comma separated allowed origins>}"
REGION=europe-west3

gcloud run deploy steinabi-api --source . --region="$REGION" \
  --min-instances=1 --max-instances=3 --concurrency=40 --allow-unauthenticated \
  --set-env-vars "^@^STORAGE_BUCKET=steinabi-originals@ALLOWED_ORIGINS=${ORIGINS}" \
  --set-secrets "SESSION_SECRET=steinabi-session-secret:latest,HASH_SALT=steinabi-hash-salt:latest,TEAM_USERS=steinabi-team-users:latest,CLEANUP_TOKEN=steinabi-cleanup-token:latest"
