## 2025-02-20 - N+1 Query in Market Settlement
**Learning:** The `settleMarket` function was iterating over wagers and fetching merchant configuration for each wager individually inside the loop. This causes an N+1 query problem, scaling linearly with the number of wagers.
**Action:** When processing a list of items (like wagers) that refer to other entities (like merchants), always collect the referenced IDs first and fetch the related entities in a single batch query (e.g., using `WHERE id = ANY($1)`) before iterating.
