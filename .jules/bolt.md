## 2024-05-22 - [Phantom Optimization]
**Learning:** Memory indicated `settleMarket` already had bulk fetching, but code inspection revealed a clear N+1 issue.
**Action:** Always verify "known" optimizations against the actual code. Trust code over memory.
