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
    query: jest.fn() // mock query as well just in case, though settleMarket uses getClient
}));

jest.mock('../src/services/socketService', () => ({
    emitMarketStatusUpdate: jest.fn()
}));

jest.mock('../src/services/schedulerService', () => ({
    SchedulerService: {
        scheduleMarketJobs: jest.fn()
    }
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

    it('should demonstrate N+1 queries when fetching merchant config', async () => {
        const marketId = 'market-123';
        const wagerCount = 10;

        // Setup mock responses for the sequence of queries

        // 1. BEGIN
        mockQuery.mockResolvedValueOnce({});

        // 2. Fetch Market
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: marketId,
                status: 'OPEN',
                pool_yes: 1000,
                pool_no: 1000
            }]
        });

        // 3. Fetch Wagers
        const wagers = [];
        for (let i = 0; i < wagerCount; i++) {
            wagers.push({
                id: `wager-${i}`,
                merchant_id: `merchant-${i}`,
                selection: 'yes',
                stake: 10
            });
        }
        mockQuery.mockResolvedValueOnce({ rows: wagers });

        // 4. Fetch Merchants (Bulk)
        const merchants = [];
        for (let i = 0; i < wagerCount; i++) {
            merchants.push({
                id: `merchant-${i}`,
                config: { default_rake: 0.05 }
            });
        }
        mockQuery.mockResolvedValueOnce({ rows: merchants });

        // 5. Loop for wagers (N times)
        // Now only updates wager
        for (let i = 0; i < wagerCount; i++) {
            // Update wager
            mockQuery.mockResolvedValueOnce({});
        }

        // 6. Update Market
        mockQuery.mockResolvedValueOnce({});

        // 7. COMMIT
        mockQuery.mockResolvedValueOnce({});

        // 8. Fetch Final Wagers (for Webhook)
        mockQuery.mockResolvedValueOnce({ rows: wagers });

        await settleMarket(marketId, 'yes');

        // Verify total query count
        // 1 (BEGIN) + 1 (Market) + 1 (Wagers) + 1 (Merchants Bulk) + 10 (Update Wager) + 1 (Update Market) + 1 (COMMIT) + 1 (Final Wagers)
        // = 1 + 1 + 1 + 1 + 10 + 1 + 1 + 1 = 17 queries

        console.log(`Total queries executed: ${mockQuery.mock.calls.length}`);

        expect(mockQuery).toHaveBeenCalledTimes(17);

        // Verify we are calling the bulk fetch
        const merchantBulkQuery = mockQuery.mock.calls.find(call =>
            call[0].includes('SELECT id, config FROM merchants WHERE id = ANY')
        );
        expect(merchantBulkQuery).toBeDefined();

        // Verify we are NOT calling the N+1 query
        const merchantConfigQueries = mockQuery.mock.calls.filter(call =>
            call[0].includes('SELECT config FROM merchants WHERE id = $1')
        );
        expect(merchantConfigQueries.length).toBe(0);
    });
});
