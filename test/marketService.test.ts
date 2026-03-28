import { settleMarket } from '../src/services/marketService';

// Mocks
const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockClient = {
    query: mockQuery,
    release: mockRelease
};

jest.mock('../src/config/db', () => ({
    getClient: jest.fn(() => Promise.resolve(mockClient)),
    query: jest.fn()
}));

jest.mock('../src/services/socketService', () => ({
    emitMarketStatusUpdate: jest.fn()
}));

jest.mock('../src/services/loggerService', () => ({
    LoggerService: {
        info: jest.fn(),
        error: jest.fn()
    }
}));

jest.mock('../src/services/webhookService', () => ({
    WebhookService: {
        notifySettlement: jest.fn()
    }
}));

describe('marketService - settleMarket', () => {
    beforeEach(() => {
        mockQuery.mockReset();
        mockRelease.mockReset();
    });

    it('should settle market and calculate payouts (reproduction of N+1)', async () => {
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

        // 3. Fetch Wagers (3 winning wagers)
        mockQuery.mockResolvedValueOnce({
            rows: [
                { id: 1, merchant_id: 101, selection: 'yes', stake: 100 },
                { id: 2, merchant_id: 102, selection: 'yes', stake: 100 },
                { id: 3, merchant_id: 101, selection: 'yes', stake: 100 } // Same merchant as wager 1
            ]
        });

        // Optimization: Batch fetch merchant configs
        mockQuery.mockResolvedValueOnce({
            rows: [
                { id: 101, config: { default_rake: 0.05 } },
                { id: 102, config: { default_rake: 0.05 } }
            ]
        });

        // Wager 1: Update wager
        mockQuery.mockResolvedValueOnce({});

        // Wager 2: Update wager
        mockQuery.mockResolvedValueOnce({});

        // Wager 3: Update wager
        mockQuery.mockResolvedValueOnce({});

        // 4. Update Market Status
        mockQuery.mockResolvedValueOnce({});

        // 5. COMMIT
        mockQuery.mockResolvedValueOnce({});

        // 6. Fetch Final Wagers (for Webhook)
        mockQuery.mockResolvedValueOnce({
             rows: [
                { id: 1, merchant_id: 101, selection: 'yes', stake: 100 },
                { id: 2, merchant_id: 102, selection: 'yes', stake: 100 },
                { id: 3, merchant_id: 101, selection: 'yes', stake: 100 }
            ]
        });

        await settleMarket(marketId, outcome);

        // Verify N+1 queries solved
        // Filter calls to merchant config fetch
        const merchantFetches = mockQuery.mock.calls.filter((call: any[]) =>
            call[0] && call[0].includes('FROM merchants')
        );

        // Expect 1 fetch (batch) instead of 3
        expect(merchantFetches.length).toBe(1);
        expect(merchantFetches[0][0]).toContain('WHERE id = ANY($1)');
    });
});
