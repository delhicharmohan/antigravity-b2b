## 2025-02-12 - N+1 Query in `settleMarket`
**Learning:** Found and fixed an N+1 query issue in `settleMarket` where merchant configs were fetched inside a wager loop. This contradicts the memory that claimed it was already optimized with bulk fetch. Always trust the code over memory/docs.
**Action:** When auditing for performance, verify "optimized" code paths by reading the source, not just assuming the documentation is up-to-date.
