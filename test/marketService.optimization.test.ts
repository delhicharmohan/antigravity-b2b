import { settleMarket } from '../src/services/marketService';
import { Totalisator } from '../src/core/totalisator';

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

// Mock socketService
jest.mock('../src/services/socketService', () => ({
    emitMarketStatusUpdate: jest.fn()
}));

// Mock loggerService - Note: It's dynamically imported in the service, so we might need to mock the module
jest.mock('../src/services/loggerService', () => ({
    LoggerService: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn()
    }
}));

// Mock webhookService - Dynamically imported
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

    it('should reproduce N+1 query issue when fetching merchant configs', async () => {
        const marketId = 'market-123';
        const outcome = 'yes';
        const merchantId1 = 'merchant-1';
        const merchantId2 = 'merchant-2';

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

        // 3. Fetch Wagers - Simulate 10 wagers (5 from each merchant)
        const wagers: any[] = [];
        for (let i = 0; i < 10; i++) {
            wagers.push({
                id: `wager-${i}`,
                merchant_id: i % 2 === 0 ? merchantId1 : merchantId2,
                market_id: marketId,
                selection: 'yes', // All winning wagers to trigger rake fetch
                stake: 100
            });
        }
        mockQuery.mockResolvedValueOnce({ rows: wagers });

        // Now, for each wager, the current implementation will query the merchant config.
        // We also need to mock the UPDATE wagers query.

        // We will just return default config for any SELECT FROM merchants
        // And success for UPDATE wagers
        mockQuery.mockImplementation((query, params) => {
            if (query.includes('SELECT config FROM merchants') || query.includes('SELECT id, config FROM merchants')) {
                // Return configs for all requested IDs if it's the bulk query
                if (params && Array.isArray(params[0])) {
                     const ids = params[0];
                     return Promise.resolve({
                        rows: ids.map((id: string) => ({ id, config: { default_rake: 0.05 } }))
                     });
                }

                return Promise.resolve({
                    rows: [{ config: { default_rake: 0.05 } }]
                });
            }
            if (query.includes('UPDATE wagers')) {
                return Promise.resolve({});
            }
            if (query.includes('UPDATE markets')) {
                return Promise.resolve({});
            }
            if (query.includes('COMMIT')) {
                return Promise.resolve({});
            }
            // Catch-all for other queries (like re-fetching wagers for webhooks)
            if (query.includes('SELECT * FROM wagers')) {
                 return Promise.resolve({ rows: wagers });
            }
            return Promise.resolve({ rows: [] });
        });

        await settleMarket(marketId, outcome);

        // Count how many times "SELECT config FROM merchants" was called
        const merchantConfigQueries = mockQuery.mock.calls.filter(call =>
            call[0].includes('SELECT config FROM merchants') || call[0].includes('SELECT id, config FROM merchants')
        );

        console.log(`Merchant config queries: ${merchantConfigQueries.length}`);

        // In the optimized version, this should be 1 (bulk fetch)
        expect(merchantConfigQueries.length).toBe(1);
    });
});
