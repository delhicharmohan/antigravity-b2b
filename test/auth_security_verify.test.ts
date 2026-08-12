import { describe, it, expect, mock } from 'bun:test';
import { Request, Response } from 'express';
import { authenticateMerchant } from '../src/middleware/auth';

// Mock the database query
mock.module('../src/config/db', () => ({
    query: async (sql: string, params: any[]) => {
        if (sql.includes('WHERE api_key_hash = $1')) {
            // Simulate no merchant found for the given hash
            return { rows: [] };
        }
        return { rows: [] };
    }
}));

// Mock LoggerService to avoid DB calls during tests
mock.module('../src/services/loggerService', () => ({
    LoggerService: {
        info: mock(() => Promise.resolve()),
        warn: mock(() => Promise.resolve()),
        error: mock(() => Promise.resolve())
    }
}));

describe('authenticateMerchant Security', () => {
    it('should not return sensitive debug info in 403 response', async () => {
        const req = {
            header: (name: string) => {
                if (name === 'X-Merchant-API-Key') return 'invalid-key';
                return undefined;
            },
            method: 'GET',
            body: {}
        } as unknown as Request;

        let responseData: any;
        let statusCode: number = 0;

        const res = {
            status: (code: number) => {
                statusCode = code;
                return res;
            },
            json: (data: any) => {
                responseData = data;
                return res;
            }
        } as unknown as Response;

        const next = (() => {}) as any;

        await authenticateMerchant(req, res, next);

        expect(statusCode).toBe(403);
        expect(responseData).toEqual({ error: 'Invalid API Key' });
        expect(responseData.debug).toBeUndefined();
        expect(responseData.sentKey).toBeUndefined();
        expect(responseData.sentHash).toBeUndefined();
        expect(responseData.availableHashes).toBeUndefined();
    });
});
