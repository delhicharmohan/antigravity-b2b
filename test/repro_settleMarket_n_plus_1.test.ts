import { settleMarket } from '../src/services/marketService';

// Mock getClient
const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockClient = {
    query: mockQuery,
    release: mockRelease
};

jest.mock('../src/config/db', () => ({
    getClient: jest.fn(() => Promise.resolve(mockClient))
}));

// Mock other services to avoid side effects
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

describe('settleMarket N+1 Query Reproduction', () => {
    beforeEach(() => {
        mockQuery.mockReset();
        mockRelease.mockReset();
    });

    it('should show N+1 queries when fetching merchant configs', async () => {
        const marketId = 'market-123';
        const outcome = 'yes';
        const wagersCount = 5;

        // 1. Mock BEGIN
        mockQuery.mockResolvedValueOnce({});

        // 2. Mock Market Fetch
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: marketId,
                status: 'OPEN',
                pool_yes: 1000,
                pool_no: 1000
            }]
        });

        // 3. Mock Wagers Fetch
        const wagers = Array.from({ length: wagersCount }, (_, i) => ({
            id: `wager-${i}`,
            merchant_id: `merchant-${i}`,
            market_id: marketId,
            selection: 'yes', // All winners
            stake: 100,
            status: 'ACCEPTED'
        }));
        mockQuery.mockResolvedValueOnce({ rows: wagers });

        // 4. Mock Merchant Configs (Batch fetch optimization)
        mockQuery.mockResolvedValueOnce({
            rows: Array.from({ length: wagersCount }, (_, i) => ({
                id: `merchant-${i}`,
                config: { default_rake: 0.05 }
            }))
        });

        // 5. Mock Wager Updates
        for (let i = 0; i < wagersCount; i++) {
            mockQuery.mockResolvedValueOnce({});
        }

        // 6. Mock Market Status Update
        mockQuery.mockResolvedValueOnce({});

        // 6. Mock COMMIT
        mockQuery.mockResolvedValueOnce({});

        // 7. Mock Webhook wagers fetch (happens after commit)
        mockQuery.mockResolvedValueOnce({ rows: wagers });

        await settleMarket(marketId, outcome);

        // Count how many times we queried the merchants table
        const merchantQueries = mockQuery.mock.calls.filter(call =>
            call[0] && call[0].includes('FROM merchants') && call[0].includes('SELECT')
        );

        console.log(`Number of merchant queries: ${merchantQueries.length}`);

        // In the optimized version, this should be 1
        expect(merchantQueries.length).toBe(1);
    });
});
