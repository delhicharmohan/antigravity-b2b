# Merchant Integration Guide — IPL Cricket Supplement
### Antigravity B2B Platform · v1.2 · April 2026

> This document extends the **Merchant Integration Guide v1.1**.  
> Authentication, signatures, webhooks, and error codes remain unchanged.  
> Everything here is **additive** — your existing integration keeps working.

---

## What's New

The Antigravity platform now supports **live IPL T20 prediction markets** powered by real-time Roanuz Cricket data. This unlocks two new contest types for your users:

| Type | Description | When |
|---|---|---|
| **Pre-match contests** | Binary markets on match outcome, runs, sixes | Up to 30 min before match start |
| **Micro-contests** | N-way live markets on the *next over* (runs bracket, biggest event) | During every over of the match |

**Base URL (Production)**:
```
https://antigravity-b2b.onrender.com
```

---

## 1. IPL REST Endpoints

All IPL endpoints use your standard `X-Merchant-API-Key` header. No signature is required for GET requests.

### 1.1 List Tournaments
```
GET /v1/ipl/tournaments
```
Returns all cricket tournaments synced from Roanuz.

**Response:**
```json
{
  "tournaments": [
    {
      "id": "uuid",
      "roanuz_key": "a-rz--cricket--bcci--iplt20--2026-ZGwl",
      "name": "Indian Premier League, 2026",
      "status": "UPCOMING",
      "start_date": "2026-03-22T00:00:00Z",
      "end_date": "2026-05-25T00:00:00Z"
    }
  ]
}
```

---

### 1.2 List Matches
```
GET /v1/ipl/matches
```
**Query Parameters:**

| Param | Values | Description |
|---|---|---|
| `status` | `SCHEDULED`, `LIVE`, `COMPLETED`, `ABANDONED` | Filter by match state |
| `date` | `YYYY-MM-DD` | Matches on a specific date |
| `team` | `pbks`, `gt`, `csk`, `mi`, `rcb`, `kkr`, `rr`, `srh`, `dc`, `lsg` | Filter by team key |

**Match Object:**
```json
{
  "matches": [
    {
      "id": "76b0f908-7eab-4419-ac32-36627612f6fc",
      "roanuz_key": "a-rz--cricket--WJ2031799081206177796",
      "match_number": 1,
      "team_a": { "key": "pbks", "name": "Punjab Kings", "short_name": "PBKS" },
      "team_b": { "key": "gt",   "name": "Gujarat Titans", "short_name": "GT" },
      "venue": "Punjab Cricket Association IS Bindra Stadium, Mohali",
      "start_time": "2026-03-31T14:00:00Z",
      "status": "LIVE",
      "score": [],
      "micro_contests_enabled": true
    }
  ]
}
```

> **Tip**: Poll `GET /v1/ipl/matches?status=LIVE` every 60s if you are not using WebSocket.

---

### 1.3 Get Match Detail
```
GET /v1/ipl/matches/:matchKey
```
`:matchKey` is either the `roanuz_key` or the internal UUID `id`.  
Returns full match detail including live `score`, `toss`, `result`, and `match_odds`.

---

### 1.4 Get Match Contests (Pre-match Markets)
```
GET /v1/ipl/matches/:matchKey/contests
```
Returns all pre-match binary prediction markets for a match.

**Response:**
```json
{
  "contests": [
    {
      "id": "5d5d573d-1afb-4ba5-8594-ae480f096e1f",
      "title": "Who will win: PBKS vs GT?",
      "contest_type": "MATCH_WINNER",
      "status": "OPEN",
      "pool_yes": "350.00",
      "pool_no": "250.00",
      "closure_timestamp": 1774963800000,
      "resolution_timestamp": 1774985400000
    },
    {
      "id": "c66a78e7-55bb-4c7c-849d-f93d46f10c6f",
      "title": "Will there be 12+ sixes in PBKS vs GT?",
      "contest_type": "TOTAL_SIXES",
      "status": "OPEN",
      "pool_yes": "250.00",
      "pool_no": "250.00",
      "closure_timestamp": 1774963800000,
      "resolution_timestamp": 1774985400000
    }
  ]
}
```

**Contest Types:**

| `contest_type` | Question | `yes` means | `no` means |
|---|---|---|---|
| `MATCH_WINNER` | Which team wins? | Team A wins | Team B wins |
| `TOTAL_SIXES` | 12+ sixes in the match? | Yes, 12 or more | No, fewer than 12 |
| `RUNS_BRACKET` | Total runs over/under? | Over threshold | Under threshold |

> [!NOTE]
> Pre-match markets close **30 minutes before match start**. Wagers after this return `400 Betting window has closed`.

---

### 1.5 Get Live Micro-Contests
```
GET /v1/ipl/matches/:matchKey/micro
```
Returns the currently **open** over-by-over micro-contests (up to 5).

**Response:**
```json
{
  "microContests": [
    {
      "id": "lmc-uuid",
      "market_id": "market-uuid",
      "over_number": 7,
      "innings": 1,
      "contest_type": "OVER_OUTCOME",
      "status": "OPEN",
      "title": "Biggest Event in Over 7 (Innings 1)",
      "pools": { "wicket": 0, "six": 150, "four": 80, "extra": 20, "dot": 0, "normal": 50 },
      "total_pool": "300.00",
      "opened_at": "2026-03-31T15:22:10Z"
    },
    {
      "id": "lmc-uuid-2",
      "market_id": "market-uuid-2",
      "over_number": 7,
      "innings": 1,
      "contest_type": "OVER_RUNS",
      "status": "OPEN",
      "title": "Runs in Over 7 (Innings 1)",
      "pools": { "0-4": 50, "5-8": 120, "9-12": 200, "13+": 80 },
      "total_pool": "450.00"
    }
  ]
}
```

**Micro-Contest Types:**

| `contest_type` | Options | Wins if |
|---|---|---|
| `OVER_OUTCOME` | `wicket` `six` `four` `extra` `dot` `normal` | Biggest event in the over matches your selection |
| `OVER_RUNS` | `0-4` `5-8` `9-12` `13+` | Total runs in the over falls in your bracket |

> [!IMPORTANT]
> Micro-contests have a **~3 minute betting window**. They open when an over starts and close when the next over begins. Build urgency into your UX.

---

### 1.6 List Players
```
GET /v1/ipl/players?team=pbks
```
Returns player roster with `name`, `role`, `batting_style`, `bowling_style`.

---

## 2. Placing Wagers on IPL Markets

You use the **same wager endpoint** as all other markets:
```
POST /v1/wager
```

### 2.1 Pre-match Contests (binary — yes/no)
These work identically to standard platform markets:
```json
{
  "marketId": "5d5d573d-1afb-4ba5-8594-ae480f096e1f",
  "selection": "yes",
  "stake": 100,
  "userId": "your_user_firebase_uid"
}
```
`"yes"` = Team A wins (or threshold met). `"no"` = Team B wins (or threshold not met).

### 2.2 Micro-Contests (N-way Pari-mutuel pools)
The `selection` field must exactly match one of the pool option keys:

**OVER_OUTCOME example:**
```json
{
  "marketId": "micro-market-uuid",
  "selection": "six",
  "stake": 50,
  "userId": "your_user_firebase_uid"
}
```

Valid selections:

| Contest | Valid `selection` values |
|---|---|
| `OVER_OUTCOME` | `wicket` `six` `four` `extra` `dot` `normal` |
| `OVER_RUNS` | `0-4` `5-8` `9-12` `13+` |

**Success Response:**
```json
{
  "status": "accepted",
  "wagerId": "wager-uuid",
  "marketId": "market-uuid",
  "stake": 50,
  "selection": "six"
}
```

> [!IMPORTANT]
> **Liquidity Guard:** No single wager may exceed 50% of the current total pool.  
> For fresh micro-contest pools, cap your UI's max stake to ~500 units until the pool grows.

---

## 3. Real-Time WebSocket Events

Connect to the platform Socket.io server for live events without polling.

**Connection:**
```javascript
import { io } from 'socket.io-client';

const socket = io('https://antigravity-b2b.onrender.com');
```

### 3.1 Join Rooms
```javascript
// Subscribe to a specific live match
socket.emit('join_ipl_match', { matchKey: 'a-rz--cricket--WJ2031799081206177796' });

// Subscribe to the IPL lobby (all match summaries)
socket.emit('join_ipl_lobby');
```

---

### 3.2 `scorecard_update`
Fires on every delivery. Use for the live scorecard display.

```javascript
socket.on('scorecard_update', (data) => {
  // data.matchKey       — match identifier
  // data.status         — LIVE | INNINGS_BREAK | COMPLETED | ABANDONED
  // data.summary        — "PBKS: 142/4 (15.2 ov)"
  // data.innings[]      — full batting/bowling scorecard per innings
  // data.lastBall       — { runs, type, commentary, batsman, bowler, over, ball }
  // data.matchOdds      — { teamA: 1.65, teamB: 2.30 }
  // data.result         — match result string (null if still in play)
});
```

**`lastBall.type` values:** `SIX` · `FOUR` · `WICKET` · `DOT` · `EXTRA` · `1 RUN` · `2 RUNS` · `3 RUNS`

---

### 3.3 `ball_update`
Fires per delivery for animations only (lighter payload than `scorecard_update`).

```javascript
socket.on('ball_update', (data) => {
  // data.runs, data.type, data.commentary, data.batsman, data.bowler
});
```

---

### 3.4 `micro_contest_open` ⭐
Fires when a new over starts and micro-contests are open for betting.  
**This is your trigger to show the "BET NOW" UI to users.**

```javascript
socket.on('micro_contest_open', (data) => {
  // data.over            — e.g. 8
  // data.inningsNumber   — 1 or 2
  // data.markets[]       — array of market objects with pools + closure_timestamp
  
  showBetNowPrompt(data);
});
```

---

### 3.5 `micro_contest_settled` ⭐
Fires immediately when an over ends and results are calculated.  
Use this to show the outcome animation. **Payout amounts come via the settlement webhook.**

```javascript
socket.on('micro_contest_settled', (data) => {
  // data.marketId        — which market settled
  // data.contestType     — OVER_OUTCOME | OVER_RUNS
  // data.over            — over number
  // data.winningOption   — e.g. "six" or "9-12"
  // data.actualData      — { runs, wickets, sixes, fours, dots, extras, biggest_event }
  
  showResultAnimation(data.winningOption, data.actualData);
});
```

---

### 3.6 `ipl_match_status` (lobby)
Summary broadcast to all clients in `join_ipl_lobby`.

```javascript
socket.on('ipl_match_status', (data) => {
  // data.matchKey, data.status, data.summary, data.score[]
});
```

---

## 4. Micro-Contest Lifecycle

```
Over N-1 ball 6 bowled
       │
       ├─ 🔔 micro_contest_open fired
       │      → 2 markets created (OVER_OUTCOME + OVER_RUNS for Over N)
       │      → ~3 min betting window
       │
       │  [Users place wagers on Over N]
       │
Over N ball 6 bowled
       │
       ├─ 🔐 Betting closed (force-closes both markets)
       │
       ├─ 🏆 micro_contest_settled fired → winningOption announced
       │
       └─ 💰 market.settled webhook → payout amounts per wager
```

> [!WARNING]
> Do not display a micro-contest if `Date.now() > closure_timestamp - 60000`.  
> The betting window may already be effectively closed.

---

## 5. Settlement Timing

| Contest | Settles When | Void Condition |
|---|---|---|
| `MATCH_WINNER` | Within 15 min of match completing | Match abandoned (no result) |
| `TOTAL_SIXES` | Within 15 min of match completing | Match abandoned |
| `RUNS_BRACKET` | Within 15 min of match completing | Match abandoned |
| `OVER_OUTCOME` | Immediately after the over ends | Never voided |
| `OVER_RUNS` | Immediately after the over ends | Never voided |

---

## 6. Quick Reference Card

**Endpoints:**

| Method | Path | Use |
|---|---|---|
| `GET` | `/v1/ipl/tournaments` | List tournaments |
| `GET` | `/v1/ipl/matches` | List matches (filter: `status`, `date`, `team`) |
| `GET` | `/v1/ipl/matches/:key` | Match detail |
| `GET` | `/v1/ipl/matches/:key/contests` | Pre-match binary markets |
| `GET` | `/v1/ipl/matches/:key/micro` | Open micro-contests right now |
| `GET` | `/v1/ipl/players` | Player roster |
| `POST` | `/v1/wager` | Place wager (same as before) |

**Socket Events:**

| Event | Direction | Use |
|---|---|---|
| `join_ipl_match` | → Server | Subscribe to match room |
| `join_ipl_lobby` | → Server | Subscribe to all matches |
| `scorecard_update` | ← Server | Live scorecard every ball |
| `ball_update` | ← Server | Ball animation data |
| `micro_contest_open` | ← Server | Trigger "BET NOW" UI |
| `micro_contest_settled` | ← Server | Show over result |
| `ipl_match_status` | ← Server | Lobby ticker |

---

## 7. Recommended UX Flow

```
1. App load
   → GET /v1/ipl/matches?status=LIVE
   → Display live match banner + current score

2. User opens a match
   → socket.emit('join_ipl_match', { matchKey })
   → GET /v1/ipl/matches/:key/contests  (show pre-match bets if before start)
   → Listen for scorecard_update  (display live score)

3. During the match
   → Listen for micro_contest_open
   → Show push/bottom sheet: "⚡ BET ON OVER 8 — 3 MIN LEFT!"
   → GET /v1/ipl/matches/:key/micro  (show pool distribution)

4. User places wager
   → POST /v1/wager  { marketId, selection: "six", stake, userId }

5. Over ends
   → micro_contest_settled → show result animation
   → market.settled webhook → credit winners in your wallet

6. Match ends
   → scorecard_update with status: "COMPLETED"
   → market.settled webhook for all pre-match markets
```

---

*For integration support, contact your Antigravity account manager.*  
*Base authentication, webhook signatures, and error codes: see Merchant Integration Guide v1.1.*
