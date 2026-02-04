import { settleMarket } from '../src/services/marketService';

// Mocks
const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockClient = {
    query: mockQuery,
    release: mockRelease
};

jest.mock('../src/config/db', () => ({
    getClient: jest.fn(() => Promise.resolve(mockClient))
}));

jest.mock('../src/services/socketService', () => ({
    emitMarketStatusUpdate: jest.fn()
}));

jest.mock('../src/services/loggerService', () => ({
    LoggerService: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn()
    }
}));

jest.mock('../src/services/webhookService', () => ({
    WebhookService: {
        notifySettlement: jest.fn()
    }
}));


describe('settleMarket Performance', () => {
    beforeEach(() => {
        mockQuery.mockReset();
        mockRelease.mockReset();
    });

    it('should fetch merchant config for each winning wager (N+1 problem)', async () => {
        const marketId = 'market-1';
        const outcome = 'yes';

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

        // 3. Fetch Wagers (3 winners)
        mockQuery.mockResolvedValueOnce({
            rows: [
                { id: 'w1', merchant_id: 'm1', selection: 'yes', stake: 100 },
                { id: 'w2', merchant_id: 'm1', selection: 'yes', stake: 100 },
                { id: 'w3', merchant_id: 'm2', selection: 'yes', stake: 100 }
            ]
        });

        // 4. Batch Fetch Merchants (This is what we expect after optimization)
        // Note: In the current code (before fix), this mock will be consumed by the first loop iteration's N+1 query,
        // which returns a single row. So this test MIGHT behave weirdly before the fix if we don't align mocks exactly.
        // However, to prove "Red" state, we just need to assert the failure.

        // Let's set up the mocks assuming the OPTIMIZED flow.
        // If the code is unoptimized, it will try to call "SELECT ... WHERE id = $1" 3 times.
        // The first call will get the batch result (which might be array of 2), but the code expects row[0].
        // If the unoptimized code receives the batch result, it might fail or pick the first one.
        // But regardless, we want to count the calls.

        // To make the test robust enough to run (and fail assertions rather than crash),
        // we can provide enough mocks.

        mockQuery.mockResolvedValueOnce({
            rows: [
                { id: 'm1', config: { default_rake: 0.1 } },
                { id: 'm2', config: { default_rake: 0.05 } }
            ]
        });

        // Updates for wagers
        mockQuery.mockResolvedValueOnce({});
        mockQuery.mockResolvedValueOnce({});
        mockQuery.mockResolvedValueOnce({});

        // 5. Update Market
        mockQuery.mockResolvedValueOnce({});
        // 6. COMMIT
        mockQuery.mockResolvedValueOnce({});
        // 7. Fetch final wagers for webhook
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await settleMarket(marketId, outcome);

        // Analyze calls
        const merchantCalls = mockQuery.mock.calls.filter(call =>
            call[0].includes('FROM merchants')
        );

        // We want exactly 1 call due to batch fetching
        expect(merchantCalls.length).toBe(1);

        // Also verify the call used ANY($1)
        if (merchantCalls.length > 0) {
             const querySQL = merchantCalls[0][0];
             // Expect the optimized query signature
             expect(querySQL).toMatch(/WHERE id = ANY/);
        }
    });
});
