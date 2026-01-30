## 2025-02-18 - [N+1 in Market Settlement]
**Learning:** The `settleMarket` function contained a critical N+1 query pattern where it fetched merchant configuration for *every* winning wager individually.
**Action:** When implementing bulk operations involving multiple entities (like settling wagers), always pre-fetch related configurations (like merchant settings) in a single batch query using `WHERE id = ANY(...)` and Map lookups.
