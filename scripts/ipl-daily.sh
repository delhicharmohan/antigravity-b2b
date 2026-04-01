#!/bin/bash
# =============================================================
#  IPL Daily Setup Script — runs before each match day
#  Designed to be called from Render Cron Job or manually
#
#  Cron schedule: 30 1 * * *   (06:00 IST = 01:30 UTC)
#
#  Usage:
#    ./scripts/ipl-daily.sh
#    BASE_URL=https://antigravity-b2b.onrender.com ./scripts/ipl-daily.sh
# =============================================================

set -euo pipefail

BASE_URL="${BASE_URL:-https://antigravity-b2b.onrender.com}"
ADMIN_SECRET="${ADMIN_SECRET:-antigravity_admin_2024}"
AUTH_HEADER="Authorization: Bearer $ADMIN_SECRET"

admin_post() {
    curl -sf -X POST -H "$AUTH_HEADER" -H "Content-Type: application/json" \
        "${BASE_URL}$1" 2>&1
}

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] IPL Daily Setup starting..."

# 1. Sync latest fixtures from Roanuz
echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Running fixture sync..."
SYNC=$(admin_post "/admin/ipl/sync")
echo "  Sync result: $SYNC"

# 2. Generate markets for today's matches
echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Generating today's markets..."
GEN=$(admin_post "/admin/ipl/generate-today")
echo "  Markets result: $GEN"

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] IPL Daily Setup complete."
