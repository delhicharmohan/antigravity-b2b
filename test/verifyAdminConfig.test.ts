import { Request, Response, NextFunction } from 'express';
import { adminLogin } from '../src/controllers/adminController';
import { authenticateAdmin } from '../src/middleware/auth';
import { ADMIN_SECRET } from '../src/config/env';

describe('Admin Secret Refactor Verification', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let next: NextFunction;

    beforeEach(() => {
        mockReq = {
            body: {},
            header: jest.fn(),
        };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        next = jest.fn();
    });

    test('ADMIN_SECRET should be loaded correctly', () => {
        expect(ADMIN_SECRET).toBeDefined();
        expect(ADMIN_SECRET.length).toBeGreaterThan(0);
    });

    test('adminLogin succeeds with correct password', async () => {
        mockReq.body = { password: ADMIN_SECRET };
        await adminLogin(mockReq as Request, mockRes as Response);

        expect(mockRes.json).toHaveBeenCalledWith({ success: true, token: ADMIN_SECRET });
        expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('adminLogin fails with incorrect password', async () => {
        mockReq.body = { password: 'wrong' };
        await adminLogin(mockReq as Request, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid admin credentials' });
    });

    test('authenticateAdmin succeeds with correct token', async () => {
        (mockReq.header as jest.Mock).mockReturnValue(`Bearer ${ADMIN_SECRET}`);
        await authenticateAdmin(mockReq as Request, mockRes as Response, next);

        expect(next).toHaveBeenCalled();
        expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('authenticateAdmin fails with incorrect token', async () => {
        (mockReq.header as jest.Mock).mockReturnValue('Bearer wrong');
        await authenticateAdmin(mockReq as Request, mockRes as Response, next);

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'Unauthorized admin access' });
        expect(next).not.toHaveBeenCalled();
    });
});
