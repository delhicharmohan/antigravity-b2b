## 2024-05-22 - N+1 Query in Market Settlement
**Learning:** The `settleMarket` function was iterating over wagers and querying the merchant config for each wager, causing a significant N+1 performance bottleneck.
**Action:** Always check loop bodies for database queries. Use `WHERE id = ANY($1)` pattern for bulk fetching resources.
