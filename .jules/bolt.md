## 2026-01-29 - N+1 Query in Market Settlement
**Learning:** The `settleMarket` function was performing N+1 queries by fetching merchant configuration inside the wager loop. This scales linearly with the number of wagers.
**Action:** Always check loops in service methods for database queries that depend on loop variables. Use bulk fetches with `WHERE id = ANY($1)` and Map lookups.
