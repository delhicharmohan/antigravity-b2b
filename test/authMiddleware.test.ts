import { Request, Response, NextFunction } from 'express';
import { authenticateMerchant } from '../src/middleware/auth';
import crypto from 'crypto';

// Mock the database query
const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({
    query: mockQuery
}));

// Extend Request interface to include rawBody
declare global {
    namespace Express {
        interface Request {
            rawBody?: Buffer;
        }
    }
}

describe('authenticateMerchant Middleware', () => {
    let req: Partial<Request>;
    let res: Partial<Response>;
    let next: NextFunction;
    let json: jest.Mock;
    let status: jest.Mock;

    const apiKey = 'test-api-key';
    const rawApiKey = 'raw-api-key-secret';
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const merchantId = 'merchant-123';

    beforeEach(() => {
        json = jest.fn();
        status = jest.fn(() => ({ json }));
        res = {
            status: status as any,
            json: json as any
        };
        next = jest.fn();

        req = {
            header: jest.fn(),
            body: {},
            method: 'POST',
            ip: '127.0.0.1'
        };

        mockQuery.mockReset();

        // Setup successful merchant lookup mock
        mockQuery.mockImplementation((text: string, params: any[]) => {
            if (text.includes('SELECT * FROM merchants WHERE api_key_hash')) {
                 if (params && params[0] === apiKeyHash) {
                     return Promise.resolve({
                        rows: [{
                            id: merchantId,
                            api_key_hash: apiKeyHash,
                            raw_api_key: rawApiKey,
                            config: { allowed_ips: ['127.0.0.1'] }
                        }]
                    });
                 }
                 return Promise.resolve({ rows: [] });
            }
             if (text.includes('SELECT id, api_key_hash FROM merchants')) {
                 return Promise.resolve({ rows: [] });
            }
            if (text.includes('SELECT api_key_hash FROM merchants')) {
                 return Promise.resolve({ rows: [] });
            }
            return Promise.resolve({ rows: [] });
        });
    });

    it('should authenticate successfully when rawBody matches signature', async () => {
        const rawBodyStr = '{ "foo": "bar" }';
        const payload = JSON.parse(rawBodyStr);

        req.body = payload;
        req.rawBody = Buffer.from(rawBodyStr);

        const signature = crypto
            .createHmac('sha256', rawApiKey)
            .update(rawBodyStr)
            .digest('hex');

        (req.header as jest.Mock).mockImplementation((name) => {
            if (name === 'X-Merchant-API-Key') return apiKey;
            if (name === 'X-Merchant-Signature') return signature;
            return undefined;
        });

        await authenticateMerchant(req as Request, res as Response, next);

        expect(next).toHaveBeenCalled();
    });

    it('should fall back to JSON.stringify if rawBody is missing', async () => {
        const payload = { foo: 'bar' };
        const bodyStr = JSON.stringify(payload);

        req.body = payload;
        req.rawBody = undefined;

        const signature = crypto
            .createHmac('sha256', rawApiKey)
            .update(bodyStr)
            .digest('hex');

        (req.header as jest.Mock).mockImplementation((name) => {
            if (name === 'X-Merchant-API-Key') return apiKey;
            if (name === 'X-Merchant-Signature') return signature;
            return undefined;
        });

        await authenticateMerchant(req as Request, res as Response, next);

        expect(next).toHaveBeenCalled();
    });
});
