
import { settleMarket } from '../src/services/marketService';
import { getClient } from '../src/config/db';

// Mock dependencies
const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockClient = {
    query: mockQuery,
    release: mockRelease
};

jest.mock('../src/config/db', () => ({
    getClient: jest.fn(() => Promise.resolve(mockClient))
}));

// Mock other services
jest.mock('../src/services/socketService', () => ({
    emitMarketStatusUpdate: jest.fn()
}));
jest.mock('../src/services/webhookService', () => ({
    WebhookService: {
        notifySettlement: jest.fn()
    }
}));
jest.mock('../src/services/loggerService', () => ({
    LoggerService: {
        info: jest.fn(),
        error: jest.fn()
    }
}));

describe('settleMarket Performance', () => {
    beforeEach(() => {
        mockQuery.mockReset();
        mockRelease.mockReset();
    });

    it('should verify N+1 query optimization', async () => {
        const wagersCount = 3;
        const marketId = 'market-1';

        // 1. BEGIN
        mockQuery.mockResolvedValueOnce({});

        // 2. Lock Market
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: marketId,
                status: 'OPEN',
                pool_yes: 1000,
                pool_no: 1000
            }]
        });

        // 3. Fetch Wagers
        const wagers = Array.from({ length: wagersCount }, (_, i) => ({
            id: `wager-${i}`,
            merchant_id: `merchant-${i % 2}`, // Two unique merchants
            selection: 'yes',
            stake: 100
        }));
        mockQuery.mockResolvedValueOnce({ rows: wagers });

        // 4. Batch Fetch Merchants (Optimization)
        mockQuery.mockResolvedValueOnce({
            rows: [
                { id: 'merchant-0', config: { default_rake: 0.05 } },
                { id: 'merchant-1', config: { default_rake: 0.05 } }
            ]
        });

        // 5. Loop execution - Updates only (No merchant fetches)
        for (let i = 0; i < wagersCount; i++) {
            mockQuery.mockResolvedValueOnce({});
        }

        // 6. Update Market Status
        mockQuery.mockResolvedValueOnce({});

        // 7. COMMIT
        mockQuery.mockResolvedValueOnce({});

        // 8. Fetch final wagers (for webhooks)
        mockQuery.mockResolvedValueOnce({ rows: wagers });

        await settleMarket(marketId, 'yes');

        // Analysis
        const totalQueries = mockQuery.mock.calls.length;
        console.log(`Total queries with ${wagersCount} wagers (Optimized): ${totalQueries}`);

        // Expected:
        // 1 (BEGIN)
        // 1 (Lock Market)
        // 1 (Fetch Wagers)
        // 1 (Batch Fetch Merchants) - NEW
        // 3 (Update Wager) - No Read
        // 1 (Update Market)
        // 1 (COMMIT)
        // 1 (Fetch Final Wagers)
        // Total = 10

        // Before optimization: 12
        expect(totalQueries).toBe(1 + 1 + 1 + 1 + wagersCount + 1 + 1 + 1);

        // Verify we are calling the batch fetch
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('SELECT id, config FROM merchants WHERE id = ANY($1)'),
            expect.any(Array)
        );

        // Verify we are NOT doing individual fetches
        const individualFetches = mockQuery.mock.calls.filter(call =>
            call[0].includes('SELECT config FROM merchants WHERE id = $1')
        );
        expect(individualFetches.length).toBe(0);
    });
});
