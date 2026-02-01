## 2026-02-01 - [N+1 Query in Market Settlement]
**Learning:** Functions that iterate over child entities (like wagers in a market) and fetch parent data (like merchant config) for each one are prone to N+1 query bottlenecks.
**Action:** Always pre-fetch parent data using `WHERE id = ANY()` and mapped lookups before iterating.
