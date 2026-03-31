import { settleMarket } from '../src/services/marketService';
import { getClient } from '../src/config/db';

// Mock DB
const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockClient = {
    query: mockQuery,
    release: mockRelease
};

jest.mock('../src/config/db', () => ({
    getClient: jest.fn(() => Promise.resolve(mockClient)),
    query: jest.fn() // For non-transactional queries if any
}));

// Mock LoggerService
jest.mock('../src/services/loggerService', () => ({
    LoggerService: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }
}));

// Mock WebhookService
jest.mock('../src/services/webhookService', () => ({
    WebhookService: {
        notifySettlement: jest.fn()
    }
}));

// Mock socketService
jest.mock('../src/services/socketService', () => ({
    emitMarketStatusUpdate: jest.fn()
}));

describe('settleMarket Performance', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should demonstrate N+1 query issue is resolved when settling market', async () => {
        const marketId = 'market-1';
        const outcome = 'yes';
        const numWagers = 5;

        // Mock DB responses
        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ // SELECT market (FOR UPDATE)
                rows: [{
                    id: marketId,
                    status: 'OPEN',
                    pool_yes: 1000,
                    pool_no: 1000
                }]
            })
            .mockResolvedValueOnce({ // SELECT wagers
                rows: Array.from({ length: numWagers }, (_, i) => ({
                    id: `wager-${i}`,
                    merchant_id: `merchant-${i}`, // Different merchant for each wager
                    market_id: marketId,
                    selection: 'yes', // All winners
                    stake: 100,
                    status: 'ACCEPTED'
                }))
            })
            // Bulk fetch merchant configs
            .mockResolvedValueOnce({
                rows: Array.from({ length: numWagers }, (_, i) => ({
                    id: `merchant-${i}`,
                    config: { default_rake: 0.05 }
                }))
            });

        // For each wager, it will query merchant config and update wager
        for (let i = 0; i < numWagers; i++) {
            mockQuery.mockResolvedValueOnce({}); // UPDATE wager
        }

        mockQuery
            .mockResolvedValueOnce({}) // UPDATE market
            .mockResolvedValueOnce({}) // COMMIT
            .mockResolvedValueOnce({ // SELECT wagers (final fetch for webhooks)
                 rows: Array.from({ length: numWagers }, (_, i) => ({
                    id: `wager-${i}`,
                    merchant_id: `merchant-${i}`,
                    market_id: marketId,
                    selection: 'yes',
                    stake: 100,
                    payout: 190,
                    status: 'SETTLED'
                }))
            });

        await settleMarket(marketId, outcome);

        // Analyze calls
        const calls = mockQuery.mock.calls;
        const merchantConfigQueries = calls.filter(call =>
            call[0].includes('SELECT id, config FROM merchants')
        );

        console.log(`Number of wagers: ${numWagers}`);
        console.log(`Number of merchant config queries: ${merchantConfigQueries.length}`);

        // Assert optimized behavior: 1 bulk query
        expect(merchantConfigQueries.length).toBe(1);
    });
});
