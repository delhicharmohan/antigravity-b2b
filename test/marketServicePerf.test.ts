import { settleMarket } from '../src/services/marketService';

// Mock DB
const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockClient = {
    query: mockQuery,
    release: mockRelease
};
jest.mock('../src/config/db', () => ({
    getClient: jest.fn(() => Promise.resolve(mockClient))
}));

// Mock Services
jest.mock('../src/services/socketService', () => ({
    emitMarketStatusUpdate: jest.fn()
}));

// Mock Logger and Webhook via module factory for consistency with dynamic imports
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

    it('should use bulk fetch for merchant configs', async () => {
        const marketId = 'm1';
        const outcome = 'yes';

        // Setup wagers
        const wagers: any[] = [];
        for (let i = 0; i < 5; i++) {
            wagers.push({
                id: `w${i}`,
                market_id: marketId,
                merchant_id: `merchant${i}`,
                selection: 'yes',
                stake: 100,
                status: 'ACCEPTED'
            });
        }

        // Mock Implementation
        mockQuery.mockImplementation(async (text, params) => {
            if (text === 'BEGIN') return {};

            if (text.includes('SELECT * FROM markets')) {
                return {
                    rows: [{
                        id: marketId,
                        status: 'OPEN',
                        pool_yes: 1000,
                        pool_no: 1000
                    }]
                };
            }

            // Wager fetches (both initial and for webhooks)
            if (text.includes('SELECT * FROM wagers')) {
                return { rows: wagers };
            }

            // New Bulk Query
            if (text.includes('SELECT id, config FROM merchants WHERE id = ANY')) {
                const ids = params[0];
                const rows = ids.map((id: string) => ({
                    id,
                    config: { default_rake: 0.05 }
                }));
                return { rows };
            }

            // Old Query (should not be called, but handled just in case)
            if (text.includes('SELECT config FROM merchants WHERE id = $1')) {
                return {
                    rows: [{ config: { default_rake: 0.05 } }]
                };
            }

            if (text.includes('UPDATE wagers')) return {};
            if (text.includes('UPDATE markets')) return {};
            if (text === 'COMMIT') return {};

            return { rows: [] };
        });

        await settleMarket(marketId, outcome);

        // Check for Bulk Query
        const bulkQueries = mockQuery.mock.calls.filter(call =>
            call[0].includes('SELECT id, config FROM merchants WHERE id = ANY')
        );

        // Check for Individual Queries
        const individualQueries = mockQuery.mock.calls.filter(call =>
            call[0].includes('SELECT config FROM merchants WHERE id = $1')
        );

        console.log(`Bulk queries: ${bulkQueries.length}`);
        console.log(`Individual queries: ${individualQueries.length}`);

        expect(bulkQueries.length).toBe(1);
        expect(individualQueries.length).toBe(0);
    });
});
