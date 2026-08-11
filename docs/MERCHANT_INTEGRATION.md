# Merchant Integration Guide v2.0

This guide provides the technical specifications for integrating with the Antigravity B2B Betting Network.

> **What's new in v2.0**: Multi-option (MULTI) markets are now supported alongside traditional Binary (YES/NO) markets. Markets may have 2-8 custom outcomes (e.g., "Trump", "Biden", "DeSantis"). All endpoints are backwards-compatible — binary markets work exactly as before.

## 1. Authentication

All requests to the Antigravity API must be authenticated using your assigned **API Key**.

### Headers Required:
| Header | Description | Required For |
| :--- | :--- | :--- |
| `X-Merchant-API-Key` | Your raw API Key | All Requests |
| `X-Merchant-Signature` | HMAC-SHA256 signature of the request body | POST/PUT/DELETE |
| `Content-Type` | `application/json` | Requests with Body |

### Signature Generation
For any request containing a body (POST/PUT/PATCH), you must generate a hex-encoded HMAC-SHA256 signature to verify the payload integrity.

- **Secret**: Your raw API Key.
- **Payload**: The exact JSON string of the request body.

**Node.js Reference:**
```javascript
const crypto = require('crypto');

const apiKey = 'your_api_key';
const body = { marketId: '...', selection: 'yes', stake: 100 };
const bodyStr = JSON.stringify(body);

const signature = crypto
  .createHmac('sha256', apiKey)
  .update(bodyStr)
  .digest('hex');

// Headers value for X-Merchant-Signature: signature
```

## 2. Market Types

Antigravity supports two market types. Your frontend must handle both.

### 2.1 Binary Markets (`market_type: "BINARY"`)
Traditional yes/no prediction markets. Users bet on one of two outcomes.

- **Selection values**: `"yes"` or `"no"`
- **Pool fields**: `pool_yes`, `pool_no`, `total_pool`
- **Odds/Metrics**: Keyed by `"yes"` and `"no"`

### 2.2 Multi-Option Markets (`market_type: "MULTI"`)
Markets with 2-8 custom outcomes. Examples: "Who will win the election?", "Which crypto will lead Q3 gains?"

- **Selection values**: Must match one of the values in the `options` array (lowercased)
- **Pool fields**: `pools` (JSON object with each option as a key), `total_pool`
- **Odds/Metrics**: Keyed by each option name (lowercased)
- **Options array**: `options` field contains the display-friendly labels

> [!IMPORTANT]
> Option keys are **sanitized** to contain only alphanumeric characters, spaces, hyphens, and underscores. When placing a wager, always lowercase the `selection` value. Example: if `options: ["Bitcoin", "Ethereum"]`, submit `selection: "bitcoin"`.

## 3. API Endpoints

### 3.1 List Markets
Fetch all active prediction markets available for betting.

- **Endpoint**: `GET /v1/markets`
- **Query Parameters**:
    - `category` (Optional): Filter by category. Valid values: `Crypto`, `Finance`, `Economy`, `Tech`, `NFL`, `NBA`, `Cricket`, `Football`, `Sports`, `Politics`, `Election`, `Science`, `Weather`, `Geopolitics`, `Culture`, `Other`.
    - `term` (Optional): Filter by resolution horizon. Valid values: `Ultra Short` (≤7 days), `Short` (8-21 days), `Long` (22-90 days).
    - `status` (Optional): `OPEN` (default), `RESOLVING`, `SETTLED`.
    - `market_type` (Optional): `BINARY` or `MULTI`. Omit to get both.

> [!NOTE]
> Markets enter a **Cooling-off Period** 5 minutes before their `closure_timestamp`. During this window, no new wagers will be accepted to prevent "pool sniping."

#### Binary Market Object:
```json
{
  "id": "uuid",
  "title": "Will Bitcoin exceed ₹85L by Friday?",
  "status": "OPEN",
  "market_type": "BINARY",
  "category": "Crypto",
  "term": "Ultra Short",
  "pool_yes": "1500.00",
  "pool_no": "1200.00",
  "total_pool": "2700.00",
  "closure_timestamp": 1735689600000,
  "resolution_timestamp": 1735691400000,
  "odds": {
    "yes": { "decimalOdds": 1.80, "probability": "55%", "sharePrice": 0.55, "payoutPerTen": 18.00 },
    "no": { "decimalOdds": 2.25, "probability": "44%", "sharePrice": 0.44, "payoutPerTen": 22.50 }
  },
  "probabilities": { "yes": 0.556, "no": 0.444 }
}
```

#### Multi-Option Market Object:
```json
{
  "id": "uuid",
  "title": "Which party will win the most seats?",
  "status": "OPEN",
  "market_type": "MULTI",
  "category": "Election",
  "term": "Long",
  "options": ["BJP", "Congress", "AAP"],
  "pools": { "bjp": 5000, "congress": 3000, "aap": 2000 },
  "pool_data": { "bjp": 5000, "congress": 3000, "aap": 2000 },
  "total_pool": "10000.00",
  "closure_timestamp": 1735689600000,
  "resolution_timestamp": 1735691400000,
  "odds": {
    "bjp": { "decimalOdds": 2.00, "probability": "50%", "sharePrice": 0.50, "payoutPerTen": 20.00 },
    "congress": { "decimalOdds": 3.33, "probability": "30%", "sharePrice": 0.30, "payoutPerTen": 33.30 },
    "aap": { "decimalOdds": 5.00, "probability": "20%", "sharePrice": 0.20, "payoutPerTen": 50.00 }
  },
  "probabilities": { "bjp": 0.50, "congress": 0.30, "aap": 0.20 }
}
```

> [!TIP]
> **Detecting market type**: Always check the `market_type` field. If `"MULTI"`, render the `options` array as selectable choices. If `"BINARY"` or absent, render YES/NO buttons.

### 3.2 Get Market Details
Fetch a single market with full odds and probabilities.

- **Endpoint**: `GET /v1/markets/:id`
- **Response**: Same schema as list items above.

### 3.3 Place Wager
Submit a wager on a specific market outcome.

- **Endpoint**: `POST /v1/wager`
- **Body Parameters**:
    - `marketId` (UUID): The ID of the market.
    - `selection` (String): For BINARY markets: `"yes"` or `"no"`. For MULTI markets: one of the option values from the `options` array (lowercased).
    - `stake` (Number): The amount to wager.
    - `userId` (String, Optional): Your internal user ID (e.g., Firebase UID). Echoed back in settlement webhook.

> [!IMPORTANT]
> **Liquidity Guard**: No single wager may exceed **50% of the current total pool** at the time of placement.

**BINARY Example Request:**
```json
{
  "marketId": "market-uuid",
  "selection": "yes",
  "stake": 100,
  "userId": "user_firebase_uid"
}
```

**MULTI Example Request:**
```json
{
  "marketId": "market-uuid",
  "selection": "bjp",
  "stake": 100,
  "userId": "user_firebase_uid"
}
```

**Success Response (201 Created):**

For BINARY markets:
```json
{
  "status": "accepted",
  "wagerId": "wager-uuid",
  "marketId": "market-uuid",
  "stake": 100,
  "selection": "yes",
  "metrics": {
    "yes": { "decimalOdds": 1.85, "probability": "54%", "sharePrice": 0.54, "payoutPerTen": 18.50 },
    "no": { "decimalOdds": 2.15, "probability": "46%", "sharePrice": 0.46, "payoutPerTen": 21.50 }
  }
}
```

For MULTI markets:
```json
{
  "status": "accepted",
  "wagerId": "wager-uuid",
  "marketId": "market-uuid",
  "stake": 100,
  "selection": "bjp",
  "metrics": {
    "bjp": { "decimalOdds": 1.90, "probability": "52%", "sharePrice": 0.52, "payoutPerTen": 19.00 },
    "congress": { "decimalOdds": 3.50, "probability": "28%", "sharePrice": 0.28, "payoutPerTen": 35.00 },
    "aap": { "decimalOdds": 5.20, "probability": "19%", "sharePrice": 0.19, "payoutPerTen": 52.00 }
  }
}
```

### 3.4 Advanced Display Metrics
The `metrics` object provides several ways to display market state to your users:
- **`decimalOdds`**: Standard betting odds (e.g., 2.5).
- **`probability`**: Implied probability as a percentage string.
- **`sharePrice`**: The price (0.00-1.00) to buy $1.00 of payout.
- **`payoutPerTen`**: Total return including stake for a $10 bet.

For MULTI markets, metrics are keyed by each option name. For BINARY markets, keyed by `"yes"` and `"no"`.

### 3.5 Market Groups
Markets can be grouped under themed bundles (e.g., "Bitcoin Price Predictions").

- **List Groups**: `GET /v1/market-groups` — Returns groups with nested market arrays.
- **Group Details**: `GET /v1/market-groups/:id` — Returns a single group with its markets.

Each group contains:
```json
{
  "id": "group-uuid",
  "title": "Bitcoin Price Predictions",
  "description": "Weekly BTC targets",
  "category": "Crypto",
  "markets": [ /* array of market objects with odds */ ]
}
```

### 3.6 Account Endpoints
- **Balance**: `GET /v1/balance` — Returns `{ balance: 1000.00 }`.
- **Transactions**: `GET /v1/transactions` — Returns array of `{ type, amount, balance_after, description, created_at }`.

## 4. Webhook Notifications

Antigravity pushes POST notifications to your server for real-time events.

### 4.1 Settlement & Payout Notification
Sent immediately when a market status changes to `SETTLED`. Use this to credit your users' wallets.

*   **Pari-mutuel Payouts**: The `payout` field in each wager object is the final amount to credit, calculated after the platform rake and rounded down to the nearest cent.

- **Endpoint**: `POST https://your-merchant-domain.com/api/webhooks/settlement`
- **Required Headers**:
    - `Content-Type`: `application/json`
    - `X-Webhook-Signature`: HMAC-SHA256 signature of the payload.
    - `X-Merchant-API-Key`: Your raw API Key (used for source identification).
- **Signature Calculation**:
    `signature = HMAC-SHA256(raw_api_key, JSON.stringify(payload))`

**Payload for BINARY market:**
```json
{
  "event": "market.settled",
  "marketId": "market-uuid",
  "marketStatus": "SETTLED",
  "outcome": "yes",
  "timestamp": 1704567890000,
  "wagers": [
    { "wagerId": "wager-uuid", "userId": "firebase_uid", "won": true, "payout": 150.00 },
    { "wagerId": "wager-uuid-2", "userId": "firebase_uid_2", "won": false, "payout": 0 }
  ]
}
```

**Payload for MULTI market:**
```json
{
  "event": "market.settled",
  "marketId": "market-uuid",
  "marketStatus": "SETTLED",
  "outcome": "bjp",
  "timestamp": 1704567890000,
  "wagers": [
    { "wagerId": "wager-uuid", "userId": "firebase_uid", "won": true, "payout": 190.00 },
    { "wagerId": "wager-uuid-2", "userId": "firebase_uid_2", "won": false, "payout": 0 }
  ]
}
```

> [!WARNING]
> For MULTI markets, the `outcome` field contains the winning option key (lowercased). `won` is `true` when `wager.selection === outcome`. Merchants must verify the `X-Webhook-Signature` before processing any payment.

### 4.2 Response Handling & Retry Policy
- **Success**: Return `200 OK`.
- **Validation**: `400 Bad Request` for invalid payloads.
- **Security**: `401 Unauthorized` for invalid signatures.
- **Server Error**: `500 Internal Server Error` (triggers retry).

**Retry Policy:**
- Platform will retry 3-5 times with exponential backoff on `5xx` errors or network failures.
- Retries will NOT be attempted for `4xx` error codes.

## 5. Frontend Implementation Guide

### 5.1 Rendering Markets by Type

```javascript
// Detect and render based on market type
function renderMarket(market) {
  if (market.market_type === 'MULTI') {
    // Render option buttons from market.options array
    market.options.forEach(option => {
      const key = option.toLowerCase();
      const prob = market.probabilities[key];
      const odds = market.metrics[key];
      renderOptionButton(option, prob, odds);
    });
  } else {
    // Traditional YES/NO binary market
    renderBinaryButtons(market.probabilities.yes, market.probabilities.no);
  }
}
```

### 5.2 Placing Wagers on MULTI Markets

```javascript
async function placeWager(marketId, selectedOption, stake) {
  const body = {
    marketId,
    selection: selectedOption.toLowerCase(), // Must be lowercased
    stake,
    userId: currentUser.uid
  };

  const signature = crypto
    .createHmac('sha256', API_KEY)
    .update(JSON.stringify(body))
    .digest('hex');

  const response = await fetch(`${API_BASE}/v1/wager`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Merchant-API-Key': API_KEY,
      'X-Merchant-Signature': signature
    },
    body: JSON.stringify(body)
  });

  return response.json();
}
```

## 6. Error Reference

| Code | Meaning |
| :--- | :--- |
| `400` | Invalid parameters, market closed, invalid selection for market type, or cooling-off period. |
| `401` | Missing API Key. |
| `402` | Insufficient merchant balance. |
| `403` | Invalid Signature or IP not whitelisted. |
| `404` | Market not found. |
| `500` | Internal network error. |

## 7. Webhook Troubleshooting

### 7.1 Common Webhook Errors

| Error | Likely Cause | Recommended Action |
| :--- | :--- | :--- |
| **401 Unauthorized** | Your endpoint rejected the `X-Webhook-Signature`. | Verify that you are using the correct **raw API Key** to calculate the HMAC. Ensure no extra whitespace exists in the key. |
| **403 Forbidden** | Your endpoint enforces IP whitelisting. | Ensure you have whitelisted the Antigravity platform's outbound IPs. |
| **404 Not Found** | Incorrect `webhook_url` or **Data Synchronization Issue**. | Check your `webhook_url` in the Admin Portal. If the URL is correct, ensure your system has a record of the `marketId` before processing the webhook. |
| **5xx Timeout** | Your endpoint took too long to process. | Process webhooks asynchronously. Return `200 OK` immediately and process the logic in a background task. |

### 7.2 Signature Verification Pattern

```javascript
// Example Verification Middleware (Express)
app.post('/api/webhooks/settlement', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const expected = crypto.createHmac('sha256', MY_API_KEY)
                         .update(JSON.stringify(req.body))
                         .digest('hex');

  if (signature !== expected) {
    console.error('Signature mismatch');
    return res.status(401).send('Unauthorized');
  }
  // Process settlement...
  res.status(200).send('OK');
});
```

## 8. Recommended Production Architecture (Security)

### 8.1 Server-Side API Proxy
Never call the Antigravity API directly from a browser or client-side application. Instead, implement a thin backend proxy that:
1.  Stores the `MERCHANT_API_KEY` and `API_BASE_URL` as server-side environment variables.
2.  Validates the user's local session before forwarding requests.
3.  Injects the required authentication headers and generates signatures on behalf of the user.

### 8.2 Production Endpoint Verification
- **Verified Base URL**: `https://antigravity-b2b.onrender.com/v1`
- **Example Fetch**: `https://antigravity-b2b.onrender.com/v1/markets`

### 8.3 Diagnostic Check: HTML Fallback
If your backend receives a `200 OK` status but the response body contains `<!doctype html>` instead of JSON, your URL prefix is likely incorrect. This often happens on Render when a catch-all route masks a `404 Not Found`. Verify your `API_BASE_URL` ends with `/v1` and does not have an unintended `/api` prefix or trailing slash.
