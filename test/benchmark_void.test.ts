import { mock, test, expect } from "bun:test";

let queryCount = 0;
let wagerCount = 10;

// Mocking dependencies
mock.module("../src/config/db", () => ({
    getClient: () => Promise.resolve({
        query: (text, params) => {
            queryCount++;
            if (text.includes('SELECT * FROM markets')) {
                return Promise.resolve({ rows: [{ id: 'm1', status: 'OPEN' }] });
            }
            // The bulk update should return rowCount
            if (text.includes('UPDATE wagers')) {
                return Promise.resolve({ rows: [], rowCount: wagerCount });
            }
            return Promise.resolve({ rows: [], rowCount: 1 });
        },
        release: () => {}
    }),
    query: () => Promise.resolve({ rows: [] })
}));

mock.module("../src/services/socketService", () => ({
    emitMarketStatusUpdate: () => {}
}));

mock.module("../src/services/schedulerService", () => ({
    SchedulerService: {
        scheduleMarketJobs: () => {}
    }
}));

mock.module("../src/services/loggerService", () => ({
    LoggerService: {
        info: () => Promise.resolve(),
        warn: () => Promise.resolve(),
        error: () => Promise.resolve()
    }
}));

import { voidMarket } from "../src/services/marketService";

test("benchmark voidMarket query count (optimized)", async () => {
    queryCount = 0;
    wagerCount = 10;

    const result = await voidMarket("m1");

    console.log(`Query count for ${wagerCount} wagers (optimized): ${queryCount}`);
    console.log(`Wager count returned: ${result.wagerCount}`);

    // Expected:
    // 1. BEGIN
    // 2. SELECT market (Lock)
    // 3. UPDATE wagers (Bulk)
    // 4. UPDATE market
    // 5. COMMIT
    // Total = 5 (constant, regardless of N)

    expect(queryCount).toBe(5);
    expect(result.wagerCount).toBe(wagerCount);
});
