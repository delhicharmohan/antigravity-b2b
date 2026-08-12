
import { getClient } from '../src/config/db';
import { settleMarket } from '../src/services/marketService';
import { Totalisator } from '../src/core/totalisator';

// Mock dependencies
jest.mock('../src/config/db', () => ({
    getClient: jest.fn(),
    query: jest.fn()
}));

// Mock Totalisator
jest.mock('../src/core/totalisator', () => ({
    Totalisator: {
        calculatePotentialPayout: jest.fn(() => 10.0),
    }
}));

// Mock SchedulerService
jest.mock('../src/services/schedulerService', () => ({
    SchedulerService: {
        scheduleMarketJobs: jest.fn()
    }
}));

// Mock LoggerService
jest.mock('../src/services/loggerService', () => ({
    LoggerService: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn()
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

const mockGetClient = getClient as jest.Mock;

describe('settleMarket', () => {
    let mockClientQuery: jest.Mock;
    let mockClientRelease: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockClientQuery = jest.fn();
        mockClientRelease = jest.fn();
        mockGetClient.mockResolvedValue({
            query: mockClientQuery,
            release: mockClientRelease
        });
    });

    it('should correctly settle market and optimize fetching merchant configs', async () => {
        const marketId = 'market-123';
        const outcome = 'yes';

        mockClientQuery.mockImplementation((text: string, params: any[]) => {
            if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return Promise.resolve({});

            if (text.includes('SELECT * FROM markets WHERE id = $1 FOR UPDATE')) {
                return Promise.resolve({
                    rows: [{
                        id: marketId,
                        status: 'OPEN',
                        pool_yes: 1000,
                        pool_no: 1000
                    }]
                });
            }

            if (text.includes('SELECT * FROM wagers WHERE market_id = $1')) {
                const wagers = [];
                // Winners (Merchant 1, Selection Yes)
                for (let i = 0; i < 5; i++) {
                    wagers.push({ id: `wager-win-${i}`, merchant_id: 1, selection: 'yes', stake: 10, status: 'ACCEPTED' });
                }
                // Losers (Merchant 2, Selection No)
                for (let i = 0; i < 5; i++) {
                    wagers.push({ id: `wager-loss-${i}`, merchant_id: 2, selection: 'no', stake: 10, status: 'ACCEPTED' });
                }
                return Promise.resolve({ rows: wagers });
            }

            // Old query (should not be called)
            if (text.includes('SELECT config FROM merchants WHERE id = $1')) {
                return Promise.resolve({
                    rows: [{ config: { default_rake: 0.05 } }]
                });
            }

            // New Bulk Query
            if (text.includes('SELECT id, config FROM merchants WHERE id = ANY($1)')) {
                return Promise.resolve({
                    rows: [
                        { id: 1, config: { default_rake: 0.05 } },
                        { id: 2, config: { default_rake: 0.10 } } // Different rake for loser merchant, though it doesn't matter for calc
                    ]
                });
            }

             if (text.includes('UPDATE wagers SET payout')) {
                return Promise.resolve({});
            }

            if (text.includes('UPDATE markets SET status')) {
                return Promise.resolve({});
            }

            return Promise.resolve({ rows: [] });
        });

        await settleMarket(marketId, outcome);

        const calls = mockClientQuery.mock.calls;

        // 1. Verify Optimization (N+1 check)
        let oldConfigFetchCount = 0;
        let newConfigFetchCount = 0;

        calls.forEach((call: any) => {
            if (call[0].includes('SELECT config FROM merchants WHERE id = $1')) {
                oldConfigFetchCount++;
            }
            if (call[0].includes('SELECT id, config FROM merchants WHERE id = ANY($1)')) {
                newConfigFetchCount++;
            }
        });

        expect(oldConfigFetchCount).toBe(0);
        expect(newConfigFetchCount).toBe(1);

        // 2. Verify Logic

        // Payout Calculation only for winners (5 calls)
        expect(Totalisator.calculatePotentialPayout).toHaveBeenCalledTimes(5);
        expect(Totalisator.calculatePotentialPayout).toHaveBeenCalledWith(10, expect.anything(), 'yes', 0.05); // Merchant 1 rake

        // Wager Updates (10 calls)
        const updateCalls = calls.filter((call: any) => call[0].includes('UPDATE wagers SET payout'));
        expect(updateCalls.length).toBe(10);

        // Check winner updates
        const winnerUpdates = updateCalls.filter((call: any) => call[1][0] === 10.0); // Payout 10.0
        expect(winnerUpdates.length).toBe(5);

        // Check loser updates
        const loserUpdates = updateCalls.filter((call: any) => call[1][0] === 0); // Payout 0
        expect(loserUpdates.length).toBe(5);

        // Market Update
        const marketUpdate = calls.find((call: any) => call[0].includes('UPDATE markets SET status'));
        expect(marketUpdate).toBeTruthy();
        expect(marketUpdate[1]).toEqual(['SETTLED', 'yes', marketId]);

        // Commit
        const commitCall = calls.find((call: any) => call[0] === 'COMMIT');
        expect(commitCall).toBeTruthy();
    });
});
