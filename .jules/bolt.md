## 2024-05-23 - N+1 Query in Market Settlement
**Learning:** Found an N+1 query in `settleMarket` where merchant config was fetched inside the wager loop. This is a common pattern when enriching data.
**Action:** Use batch fetching with `WHERE id = ANY($1)` and a Map for lookups.

## 2024-05-23 - Testing Cooling-Off Period
**Learning:** `wagerController` enforces a 5-minute cooling-off period before market closure. Tests mocking markets must set `closure_timestamp` at least 5 minutes in the future (e.g., +10 mins) to avoid "Market is in cooling-off period" errors.
**Action:** When creating market mocks for wager tests, verify timestamps are sufficiently far in the future.
