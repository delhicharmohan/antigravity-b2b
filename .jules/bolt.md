## 2024-05-23 - PostgreSQL Bulk Fetch
**Learning:** In this codebase, PostgreSQL queries using `IN` with dynamic arrays are best handled using `WHERE id = ANY($1)` syntax. This is crucial for optimizing N+1 query patterns.
**Action:** When fixing N+1 queries, collect IDs into an array and use `ANY($1)` to fetch all related records in a single round-trip.
