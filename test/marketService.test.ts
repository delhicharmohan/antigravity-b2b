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
    query: jest.fn() // For other calls if any
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
        jest.clearAllMocks();
    });

    it('verifies optimization (1 query instead of N)', async () => {
        const marketId = 'market-123';
        const outcome = 'yes';
        const merchantCount = 5;

        // Mock Data
        const market = {
            id: marketId,
            status: 'OPEN',
            pool_yes: 1000,
            pool_no: 1000,
            total_pool: 2000
        };

        const wagers = [];
        const merchantRows = [];
        for (let i = 0; i < merchantCount; i++) {
            wagers.push({
                id: `wager-${i}`,
                market_id: marketId,
                merchant_id: `merchant-${i}`,
                selection: 'yes',
                stake: 100,
                status: 'ACCEPTED'
            });
            merchantRows.push({
                id: `merchant-${i}`,
                config: { default_rake: 0.05 }
            });
        }

        // Setup Mock Responses in sequence
        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [market] }) // SELECT market
            .mockResolvedValueOnce({ rows: wagers }) // SELECT wagers
            .mockResolvedValueOnce({ rows: merchantRows }); // SELECT merchants (Bulk)

        // Then updates for each wager
        for (let i = 0; i < merchantCount; i++) {
            mockQuery.mockResolvedValueOnce({}); // UPDATE wager
        }

        mockQuery.mockResolvedValueOnce({}); // UPDATE market
        mockQuery.mockResolvedValueOnce({}); // COMMIT
        mockQuery.mockResolvedValueOnce({ rows: wagers }); // SELECT wagers (for webhook)

        // Execute
        await settleMarket(marketId, outcome);

        // Analyze DB Calls
        const calls = mockQuery.mock.calls;

        const oldNPlusOneQueries = calls.filter(call =>
            call[0].includes('SELECT config FROM merchants WHERE id = $1')
        );

        const newBulkQueries = calls.filter(call =>
            call[0].includes('SELECT id, config FROM merchants WHERE id = ANY($1)')
        );

        console.log(`Old Queries: ${oldNPlusOneQueries.length}, New Bulk Queries: ${newBulkQueries.length}`);

        expect(oldNPlusOneQueries.length).toBe(0);
        expect(newBulkQueries.length).toBe(1);
    });
});
