## 2025-02-12 - N+1 Query in Settlement Loop
**Learning:** `settleMarket` fetched merchant configuration for *every* winning wager to calculate rake, causing N+1 queries.
**Action:** Always bulk-fetch related configurations (like merchant configs) before iterating over large datasets (like wagers).
