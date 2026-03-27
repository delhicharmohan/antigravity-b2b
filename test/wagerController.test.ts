import { placeWager } from '../src/controllers/wagerController';
import { Request, Response } from 'express';

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
    emitOddsUpdate: jest.fn()
}));

describe('placeWager', () => {
    let req: Partial<Request>;
    let res: Partial<Response>;
    let json: jest.Mock;
    let status: jest.Mock;

    beforeEach(() => {
        json = jest.fn();
        status = jest.fn(() => ({ json }));
        res = {
            status: status as any,
            json: json as any
        };
        req = {
            body: {
                marketId: 'market-123',
                selection: 'yes',
                stake: 100,
                userId: 'user-1'
            },
            merchant: {
                id: 'merchant-1',
                config: { default_rake: 0.05 }
            },
            header: jest.fn()
        };
        mockQuery.mockReset();
        mockRelease.mockReset();
    });

    it('should fail if parameters are invalid', async () => {
        req.body.stake = -10;
        await placeWager(req as Request, res as Response);
        expect(status).toHaveBeenCalledWith(400);
    });

    it('should handle idempotency key', async () => {
        (req.header as jest.Mock).mockReturnValue('key-123');

        // Mock DB: BEGIN
        mockQuery.mockResolvedValueOnce({});
        // Mock DB: Check Idempotency (Found)
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: 'wager-existing',
                market_id: 'market-123',
                stake: 100,
                selection: 'yes'
            }]
        });
        // Mock DB: ROLLBACK
        mockQuery.mockResolvedValueOnce({});

        await placeWager(req as Request, res as Response);

        expect(mockQuery).toHaveBeenNthCalledWith(2, expect.stringContaining('SELECT * FROM wagers'), expect.any(Array));
        expect(status).toHaveBeenCalledWith(200);
        expect(json).toHaveBeenCalledWith(expect.objectContaining({
            status: 'accepted',
            wagerId: 'wager-existing',
            message: "Idempotent response: Wager already processed"
        }));
    });

    it('should deduct balance and place wager', async () => {
        (req.header as jest.Mock).mockReturnValue('key-456');

        // Sequence of DB calls
        // 1. BEGIN
        mockQuery.mockResolvedValueOnce({});

        // 2. Check Idempotency (Not Found)
        mockQuery.mockResolvedValueOnce({ rows: [] });

        // 3. Lock Market
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: 'market-123',
                status: 'OPEN',
                closure_timestamp: Date.now() + 600000,
                pool_yes: 1000,
                pool_no: 1000,
                total_pool: 2000
            }]
        });

        // 4. Update Balance (Success)
        mockQuery.mockResolvedValueOnce({
            rows: [{ balance: 9900 }]
        });

        // 5. Insert Wager
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: 'wager-new' }]
        });

        // 6. Insert Transaction
        mockQuery.mockResolvedValueOnce({});

        // 7. Update Market Pool
        mockQuery.mockResolvedValueOnce({
            rows: [{
                pool_yes: 1100,
                pool_no: 1000,
                total_pool: 2100
            }]
        });

        // 8. COMMIT
        mockQuery.mockResolvedValueOnce({});

        await placeWager(req as Request, res as Response);

        expect(status).toHaveBeenCalledWith(201);
        expect(json).toHaveBeenCalledWith(expect.objectContaining({
            wagerId: 'wager-new',
            stake: 100
        }));

        // Verify balance deduction called correctly
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE merchants'),
            [100, 'merchant-1']
        );
    });

    it('should fail with 402 if insufficient funds', async () => {
        (req.header as jest.Mock).mockReturnValue('key-fail');

        // 1. BEGIN
        mockQuery.mockResolvedValueOnce({});
        // 2. Idempotency (Empty)
        mockQuery.mockResolvedValueOnce({ rows: [] });
        // 3. Market (Open)
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: 'market-123',
                status: 'OPEN',
                closure_timestamp: Date.now() + 600000
            }]
        });
        // 4. Balance (Fail - 0 rows updated)
        mockQuery.mockResolvedValueOnce({ rows: [] });

        // 5. ROLLBACK
        mockQuery.mockResolvedValueOnce({});

        await placeWager(req as Request, res as Response);

        expect(status).toHaveBeenCalledWith(402);
        expect(json).toHaveBeenCalledWith(expect.objectContaining({
            error: 'Insufficient funds'
        }));
    });
});
