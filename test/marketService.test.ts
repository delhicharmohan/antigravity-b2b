import { settleMarket } from '../src/services/marketService';

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

// Mock dynamic imports by mocking the modules themselves
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

    it('should count merchant config queries', async () => {
        const marketId = 'market-1';
        const outcome = 'yes';

        mockQuery.mockImplementation((sql, params) => {
             if (sql === 'BEGIN') return Promise.resolve({});
             if (sql.includes('SELECT * FROM markets')) return Promise.resolve({ rows: [{ id: marketId, status: 'OPEN', pool_yes: 1000, pool_no: 1000 }] });
             if (sql.includes('SELECT * FROM wagers') && !sql.includes('FOR UPDATE')) return Promise.resolve({ rows: [
                { id: 'w1', merchant_id: 'm1', selection: 'yes', stake: 100 },
                { id: 'w2', merchant_id: 'm2', selection: 'yes', stake: 100 },
                { id: 'w3', merchant_id: 'm1', selection: 'yes', stake: 100 },
            ] });
             if (sql.includes('SELECT config FROM merchants')) return Promise.resolve({ rows: [{ config: { default_rake: 0.1 } }] });
             // Bulk fetch match (future proofing)
             if (sql.includes('SELECT id, config FROM merchants WHERE id = ANY')) return Promise.resolve({ rows: [
                 { id: 'm1', config: { default_rake: 0.1 } },
                 { id: 'm2', config: { default_rake: 0.2 } }
             ] });

             if (sql.includes('UPDATE wagers')) return Promise.resolve({});
             if (sql.includes('UPDATE markets')) return Promise.resolve({});
             if (sql === 'COMMIT') return Promise.resolve({});
             return Promise.resolve({ rows: [] });
        });

        await settleMarket(marketId, outcome);

        const merchantCalls = mockQuery.mock.calls.filter(call => call[0].includes('SELECT config FROM merchants'));
        const bulkCalls = mockQuery.mock.calls.filter(call => call[0].includes('SELECT id, config FROM merchants'));

        if (merchantCalls.length > 0) {
             console.log(`DETECTED N+1: ${merchantCalls.length} legacy merchant queries.`);
        } else {
             console.log(`OPTIMIZED: ${merchantCalls.length} legacy merchant queries, ${bulkCalls.length} bulk queries.`);
        }

        expect(merchantCalls.length).toBe(0);
        expect(bulkCalls.length).toBe(1);
    });
});
