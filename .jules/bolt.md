## 2026-02-03 - Optimized SettleMarket N+1 Query
**Learning:** `settleMarket` was fetching merchant config inside a loop, causing N+1 queries. Used `WHERE id = ANY($1)` to bulk fetch.
**Action:** Look for loops iterating over database entities and pre-fetch dependencies using array conditions.
