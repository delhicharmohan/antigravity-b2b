import { settleMarket } from '../src/services/marketService';
import { getClient } from '../src/config/db';

// Mock dependencies
jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    getClient: jest.fn()
}));
jest.mock('../src/services/loggerService');
jest.mock('../src/services/webhookService');
jest.mock('../src/services/socketService');

describe('settleMarket Performance', () => {
    let mockClient: any;
    let queryMock: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        queryMock = jest.fn();
        mockClient = {
            query: queryMock,
            release: jest.fn(),
            on: jest.fn()
        };
        (getClient as jest.Mock).mockResolvedValue(mockClient);
    });

    it('should NOT have N+1 query problem (optimized)', async () => {
        const marketId = 'market-123';
        const merchantCount = 10;

        // Mock market
        const market = {
            id: marketId,
            pool_yes: 1000,
            pool_no: 1000,
            status: 'OPEN'
        };

        // Mock wagers - 10 wagers from 10 different merchants, all winning
        const wagers = Array.from({ length: merchantCount }, (_, i) => ({
            id: `wager-${i}`,
            merchant_id: `merchant-${i}`,
            market_id: marketId,
            selection: 'yes',
            stake: 100
        }));

        queryMock.mockImplementation((text: string, params: any[]) => {
            if (text.includes('SELECT * FROM markets')) {
                return { rows: [market] };
            }
            if (text.includes('SELECT * FROM wagers')) {
                return { rows: wagers };
            }
            if (text.includes('FROM merchants')) {
                // Return bulk response
                if (params && Array.isArray(params[0])) {
                     const ids = params[0];
                     return {
                         rows: ids.map((id: string) => ({ id, config: { default_rake: 0.05 } }))
                     };
                }
                // Fallback for old single query if still used (it shouldn't be)
                return { rows: [{ config: { default_rake: 0.05 } }] };
            }
            // For updates/inserts
            return { rows: [], rowCount: 1 };
        });

        await settleMarket(marketId, 'yes');

        // Check how many times merchant config was queried
        const merchantQueries = queryMock.mock.calls.filter(call =>
            call[0].includes('FROM merchants')
        );

        // Optimized: Should be called exactly once (bulk fetch)
        expect(merchantQueries.length).toBe(1);
        console.log(`Merchant config queries count: ${merchantQueries.length}`);
    });
});
