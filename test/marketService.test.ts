import { settleMarket } from '../src/services/marketService';

// Mocks
const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockClient = {
    query: mockQuery,
    release: mockRelease,
};

jest.mock('../src/config/db', () => ({
    getClient: jest.fn(() => Promise.resolve(mockClient)),
}));

jest.mock('../src/services/loggerService', () => ({
    LoggerService: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    }
}));

jest.mock('../src/services/webhookService', () => ({
    WebhookService: {
        notifySettlement: jest.fn(),
    }
}));

jest.mock('../src/services/socketService', () => ({
    emitMarketStatusUpdate: jest.fn(),
}));

describe('settleMarket Performance', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should query merchant config once (bulk fetch) instead of N times', async () => {
        const marketId = 'market-123';
        const outcome = 'yes';

        // Mock DB responses
        mockQuery.mockImplementation((text, params) => {
            if (text.includes('BEGIN')) return Promise.resolve();
            if (text.includes('COMMIT')) return Promise.resolve();
            if (text.includes('ROLLBACK')) return Promise.resolve();

            // 1. Lock and get market
            if (text.includes('SELECT * FROM markets')) {
                return Promise.resolve({
                    rows: [{
                        id: marketId,
                        status: 'OPEN',
                        pool_yes: 1000,
                        pool_no: 1000,
                    }]
                });
            }

            // 2. Fetch all wagers
            if (text.includes('SELECT * FROM wagers WHERE market_id')) {
                return Promise.resolve({
                    rows: [
                        { id: 'wager-1', merchant_id: 1, selection: 'yes', stake: 100 },
                        { id: 'wager-2', merchant_id: 2, selection: 'yes', stake: 100 },
                        { id: 'wager-3', merchant_id: 3, selection: 'yes', stake: 100 },
                    ]
                });
            }

            // 3. Bulk Fetch merchant config (The Optimization)
            if (text.includes('SELECT id, config FROM merchants WHERE id = ANY')) {
                return Promise.resolve({
                    rows: [
                        { id: 1, config: { default_rake: 0.05 } },
                        { id: 2, config: { default_rake: 0.05 } },
                        { id: 3, config: { default_rake: 0.05 } }
                    ]
                });
            }

            // Old N+1 query (should not be called)
            if (text.includes('SELECT config FROM merchants WHERE id = $1')) {
                return Promise.resolve({
                    rows: [{ config: { default_rake: 0.05 } }]
                });
            }

            // 4. Update wager
            if (text.includes('UPDATE wagers')) {
                return Promise.resolve();
            }

             // 5. Update market status
            if (text.includes('UPDATE markets')) {
                return Promise.resolve();
            }

            return Promise.resolve({ rows: [] });
        });

        await settleMarket(marketId, outcome);

        // Verify Optimization
        const bulkFetchCalls = mockQuery.mock.calls.filter(call => call[0].includes('SELECT id, config FROM merchants WHERE id = ANY'));
        const nPlusOneCalls = mockQuery.mock.calls.filter(call => call[0].includes('SELECT config FROM merchants WHERE id = $1'));

        console.log(`Bulk fetch calls: ${bulkFetchCalls.length}`);
        console.log(`N+1 calls: ${nPlusOneCalls.length}`);

        expect(bulkFetchCalls.length).toBe(1);
        expect(nPlusOneCalls.length).toBe(0);
    });
});
