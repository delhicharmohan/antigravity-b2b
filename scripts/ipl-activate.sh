#!/bin/bash
# =============================================================
#  IPL Activation Script — Antigravity B2B
#  Runs against Render production (or any BASE_URL)
#
#  Usage:
#    ./scripts/ipl-activate.sh                          # uses PROD defaults
#    BASE_URL=http://localhost:3000 ./scripts/ipl-activate.sh   # local test
#    MATCH_KEY=<key> ./scripts/ipl-activate.sh          # subscribe specific match
# =============================================================

set -euo pipefail

# ── Configuration ──────────────────────────────────────────
BASE_URL="${BASE_URL:-https://antigravity-b2b.onrender.com}"
ADMIN_SECRET="${ADMIN_SECRET:-antigravity_admin_2024}"
IPL_TOURNAMENT_PATTERN="bcci--iplt20"   # matches roanuz_key for IPL
DAYS_AHEAD="${DAYS_AHEAD:-2}"           # how many days ahead to generate markets for

AUTH_HEADER="Authorization: Bearer $ADMIN_SECRET"

# ── Colours ────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_ok()   { echo -e "${GREEN}  ✅ $*${NC}"; }
log_err()  { echo -e "${RED}  ❌ $*${NC}"; }
log_warn() { echo -e "${YELLOW}  ⚠️  $*${NC}"; }
log_info() { echo -e "${CYAN}  →  $*${NC}"; }

echo ""
echo "═══════════════════════════════════════════════════"
echo "  🏏  Antigravity IPL Activation Script"
echo "  Target: $BASE_URL"
echo "  Date:   $(date '+%Y-%m-%d %H:%M %Z')"
echo "═══════════════════════════════════════════════════"
echo ""

# ── Helper: call admin API ──────────────────────────────────
admin_get() {
    curl -sf -H "$AUTH_HEADER" "${BASE_URL}$1" 2>&1
}
admin_post() {
    curl -sf -X POST -H "$AUTH_HEADER" -H "Content-Type: application/json" \
        ${2:+-d "$2"} "${BASE_URL}$1" 2>&1
}

# ── Step 0: Health check ────────────────────────────────────
echo "STEP 0 — Health check"
HEALTH=$(curl -sf "${BASE_URL}/health" 2>&1 || true)
if echo "$HEALTH" | grep -q '"ok"'; then
    log_ok "Server is up: $BASE_URL"
else
    log_err "Server not reachable at $BASE_URL"
    echo "  Response: $HEALTH"
    exit 1
fi
echo ""

# ── Step 1: Confirm Roanuz API is configured ───────────────
echo "STEP 1 — Verify API configuration"
DASHBOARD=$(admin_get "/admin/ipl/dashboard")
API_CONFIGURED=$(echo "$DASHBOARD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('apiConfigured','false'))" 2>/dev/null || echo "false")

if [ "$API_CONFIGURED" = "True" ] || [ "$API_CONFIGURED" = "true" ]; then
    log_ok "Roanuz API configured"
else
    log_err "apiConfigured=false — Set ROANUZ_PROJECT_KEY and ROANUZ_API_KEY in Render env vars"
    exit 1
fi
echo ""

# ── Step 2: Full tournament + fixture sync ─────────────────
echo "STEP 2 — Sync tournaments & fixtures from Roanuz"
log_info "Running full sync (may take 10-20s)..."
SYNC=$(admin_post "/admin/ipl/sync")
TOURNAMENTS=$(echo "$SYNC" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['stats']['tournaments'])" 2>/dev/null || echo "0")
MATCHES=$(echo "$SYNC" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['stats']['matches'])" 2>/dev/null || echo "0")
PLAYERS=$(echo "$SYNC" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['stats']['players'])" 2>/dev/null || echo "0")

if [ "$TOURNAMENTS" -gt 0 ] 2>/dev/null; then
    log_ok "Sync complete — Tournaments: $TOURNAMENTS | Matches: $MATCHES | Players: $PLAYERS"
else
    log_warn "Sync returned 0 tournaments — IPL may not be in Roanuz featured feed"
    log_warn "Response: $SYNC"
fi
echo ""

# ── Step 3: Fetch today's + upcoming IPL matches ───────────
echo "STEP 3 — Find IPL matches to activate"

# Get all IPL matches that are LIVE or SCHEDULED within DAYS_AHEAD
MATCHES_JSON=$(curl -sf -H "$AUTH_HEADER" \
    "${BASE_URL}/v1/ipl/matches?status=LIVE" \
    -H "X-Merchant-API-Key: test_key" 2>/dev/null || echo '{"matches":[]}')

# Also get scheduled
SCHED_JSON=$(curl -sf \
    -H "X-Merchant-API-Key: test_key" \
    "${BASE_URL}/v1/ipl/matches?status=SCHEDULED" 2>/dev/null || echo '{"matches":[]}')

# Extract IPL-only match keys (filter by team names for now — IPL teams are specific)
IPL_LIVE_KEYS=$(echo "$MATCHES_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
keys = [m['roanuz_key'] for m in data.get('matches', []) 
        if any(k in m.get('roanuz_key','') for k in ['WJ','pbks','gt','csk','mi','rcb','kkr','rr','srh','dc','lsg','pk'])]
print('\n'.join(keys))
" 2>/dev/null || echo "")

IPL_SCHED_KEYS=$(echo "$SCHED_JSON" | python3 -c "
import sys, json, datetime
data = json.load(sys.stdin)
cutoff = datetime.datetime.utcnow().isoformat()
keys = [m['roanuz_key'] for m in data.get('matches', [])
        if m.get('team_a',{}).get('key','') in ['pbks','gt','csk','mi','rcb','kkr','rr','srh','dc','lsg']
        or m.get('team_b',{}).get('key','') in ['pbks','gt','csk','mi','rcb','kkr','rr','srh','dc','lsg']]
print('\n'.join(keys[:5]))  # limit to next 5
" 2>/dev/null || echo "")

if [ -z "$IPL_LIVE_KEYS" ] && [ -z "$IPL_SCHED_KEYS" ]; then
    log_warn "No IPL matches found today. Run sync first or check Roanuz feed."
else
    [ -n "$IPL_LIVE_KEYS" ] && log_ok "Live IPL match(es) found: $IPL_LIVE_KEYS"
    [ -n "$IPL_SCHED_KEYS" ] && log_ok "Scheduled IPL match(es) found: $(echo "$IPL_SCHED_KEYS" | head -3)"
fi
echo ""

# ── Step 4: Subscribe to live matches ─────────────────────
echo "STEP 4 — Subscribe to live IPL match WebSocket feeds"

if [ -n "$IPL_LIVE_KEYS" ]; then
    while IFS= read -r KEY; do
        [ -z "$KEY" ] && continue
        log_info "Subscribing: $KEY"
        RESULT=$(admin_post "/admin/ipl/subscribe/${KEY}")
        SUBSCRIBED=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('subscribed','false'))" 2>/dev/null || echo "false")
        if [ "$SUBSCRIBED" = "True" ] || [ "$SUBSCRIBED" = "true" ]; then
            log_ok "Subscribed: $KEY"
        else
            log_warn "Subscribe returned false for $KEY (may be at 18-slot limit or already subscribed)"
        fi
    done <<< "$IPL_LIVE_KEYS"
else
    log_info "No live matches to subscribe (OK if match hasn't started yet)"
fi
echo ""

# ── Step 5: Generate today's markets ──────────────────────
echo "STEP 5 — Generate pre-match markets for today"
log_info "Generating markets for all today's unprocessed matches..."
GEN=$(admin_post "/admin/ipl/generate-today")
COUNT=$(echo "$GEN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null || echo "0")
if [ "$COUNT" -gt 0 ] 2>/dev/null; then
    log_ok "Generated $COUNT markets for today's matches"
else
    log_warn "0 new markets generated (already done today, or no matches scheduled)"
    log_info "Raw: $GEN"
fi
echo ""

# ── Step 6: Enable micro-contests for live matches ─────────
echo "STEP 6 — Enable micro-contests for live IPL matches"

if [ -n "$IPL_LIVE_KEYS" ]; then
    while IFS= read -r KEY; do
        [ -z "$KEY" ] && continue
        log_info "Enabling micro-contests for: $KEY"
        RESULT=$(admin_post "/admin/ipl/micro/enable/${KEY}")
        ENABLED=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('micro_contests_enabled','?'))" 2>/dev/null || echo "?")
        if [ "$ENABLED" = "True" ] || [ "$ENABLED" = "true" ]; then
            log_ok "Micro-contests ENABLED for $KEY"
        else
            log_warn "Micro-contests: $ENABLED for $KEY — check match exists in DB"
        fi
    done <<< "$IPL_LIVE_KEYS"
else
    log_info "No live matches — micro-contests will auto-enable when match goes live"
fi
echo ""

# ── Step 7: Final state report ─────────────────────────────
echo "STEP 7 — Final status"
FINAL=$(admin_get "/admin/ipl/dashboard")

WS_CONN=$(echo "$FINAL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['websocket']['connected'])" 2>/dev/null || echo "?")
WS_COUNT=$(echo "$FINAL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['websocket']['activeSubscriptions']))" 2>/dev/null || echo "?")
POLLER=$(echo "$FINAL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['fallbackPoller']['active'])" 2>/dev/null || echo "?")
SCHED=$(echo "$FINAL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['scheduler']['scheduledJobs'])" 2>/dev/null || echo "?")

echo ""
echo "  ┌────────────────────────────────────────┐"
echo "  │  WebSocket connected   : $WS_CONN"
echo "  │  Active subscriptions  : $WS_COUNT"
echo "  │  REST fallback poller  : $POLLER"
echo "  │  Scheduled jobs        : $SCHED"
echo "  └────────────────────────────────────────┘"
echo ""

if [ "$WS_CONN" = "True" ] || [ "$WS_CONN" = "true" ]; then
    log_ok "IPL activation complete — live feed running"
else
    log_warn "WebSocket not connected — subscribe to a live match to trigger connection"
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  Done. $(date '+%Y-%m-%d %H:%M %Z')"
echo "═══════════════════════════════════════════════════"
echo ""
