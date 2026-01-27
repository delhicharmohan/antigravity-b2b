## 2026-01-27 - N+1 Query in Market Settlement
**Learning:** `settleMarket` iterates over all winning wagers and queries the `merchants` table for each one to get the rake, causing N+1 queries.
**Action:** Use `WHERE id = ANY($1)` to fetch all required merchant configs in a single query before the loop.
