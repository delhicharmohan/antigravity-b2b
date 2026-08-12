## 2025-02-05 - Cooling-off Period Test Failures
**Learning:** Tests mocking `markets` for wager placement must set `closure_timestamp` at least 5 minutes in the future. The `placeWager` controller enforces a cooling-off period (`Date.now() > closure_timestamp - 5min`), causing tests with short closure windows to fail unexpectedly.
**Action:** When creating or mocking markets in tests, always use `Date.now() + 10 * 60 * 1000` (10 mins) or more for `closure_timestamp`.
