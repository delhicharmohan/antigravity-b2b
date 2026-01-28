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

describe('marketService - settleMarket N+1 Check', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should show reduced calls to merchants table in optimized state', async () => {
        const marketId = 'market-1';
        const outcome = 'yes';

        // Mock DB responses
        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ // SELECT market
                rows: [{
                    id: marketId,
                    status: 'OPEN',
                    pool_yes: 1000,
                    pool_no: 1000
                }]
            })
            .mockResolvedValueOnce({ // SELECT wagers
                rows: [
                    { id: 'w1', merchant_id: 'm1', selection: 'yes', stake: 100 },
                    { id: 'w2', merchant_id: 'm2', selection: 'yes', stake: 100 },
                    { id: 'w3', merchant_id: 'm1', selection: 'no', stake: 100 } // Loser
                ]
            })
            // Bulk Fetch Merchants (The Optimization)
            .mockResolvedValueOnce({
                 rows: [
                     { id: 'm1', config: { default_rake: 0.1 } },
                     { id: 'm2', config: { default_rake: 0.1 } }
                 ]
            })

            // Loop updates
            .mockResolvedValueOnce({}) // UPDATE wager w1
            .mockResolvedValueOnce({}) // UPDATE wager w2
            .mockResolvedValueOnce({}) // UPDATE wager w3

            .mockResolvedValueOnce({}) // UPDATE market
            .mockResolvedValueOnce({}) // COMMIT
            .mockResolvedValueOnce({ rows: [] }); // SELECT final wagers for webhook

        await settleMarket(marketId, outcome);

        // Verify calls
        const merchantSelectCalls = mockQuery.mock.calls.filter(call =>
            call[0] && call[0].includes('SELECT id, config FROM merchants')
        );

        console.log(`Merchant SELECT calls: ${merchantSelectCalls.length}`);

        // We expect exactly 1 call now, regardless of how many winning wagers
        expect(merchantSelectCalls.length).toBe(1);

        // Check argument for bulk fetch
        const bulkCallArgs = merchantSelectCalls[0][1];
        // Expect array of unique IDs: ['m1', 'm2'] or ['m2', 'm1']
        expect(bulkCallArgs[0]).toEqual(expect.arrayContaining(['m1', 'm2']));
        expect(bulkCallArgs[0].length).toBe(2);
    });
});
