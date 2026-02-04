## 2026-02-04 - N+1 Query in Market Settlement
**Learning:** Found an N+1 query pattern where merchant configs were fetched individually inside a loop for each winning wager in `settleMarket`.
**Action:** When handling bulk updates or settlements involving relations (like Wager -> Merchant), always batch fetch the related data (using `WHERE id = ANY(...)` and a Map) before iterating.
