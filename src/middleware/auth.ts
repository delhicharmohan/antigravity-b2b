import { Request, Response, NextFunction } from 'express';
import { query } from '../config/db';
import crypto from 'crypto';

// Extend Express Request to include merchant data
declare global {
    namespace Express {
        interface Request {
            merchant?: any;
            rawBody?: Buffer;
        }
    }
}

export const authenticateMerchant = async (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.header('X-Merchant-API-Key')?.trim();
    const signature = req.header('X-Merchant-Signature');

    if (!apiKey) {
        return res.status(401).json({ error: 'Missing API Key' });
    }

    try {
        // 1. Verify API Key exists (Lookup by hash)
        const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
        console.log(`[Auth Debug] Incoming Key: ${apiKey}, Hash: ${apiKeyHash}`);

        const allMerchants = await query('SELECT id, api_key_hash FROM merchants');
        console.log('[Auth Debug] Available Hashes:', allMerchants.rows.map(m => m.api_key_hash));

        const result = await query('SELECT * FROM merchants WHERE api_key_hash = $1', [apiKeyHash]);

        if (result.rows.length === 0) {
            const allHashes = await query('SELECT api_key_hash FROM merchants');
            return res.status(403).json({
                error: 'Invalid API Key',
                debug: {
                    sentKey: apiKey,
                    sentHash: apiKeyHash,
                    availableHashes: allHashes.rows.map(r => r.api_key_hash)
                }
            });
        }

        const merchant = result.rows[0];

        // 2. IP Whitelisting (Security Upgrade)
        const allowedIps = merchant.config?.allowed_ips;
        if (allowedIps && Array.isArray(allowedIps) && allowedIps.length > 0) {
            const clientIp = req.ip || req.socket.remoteAddress;
            // Basic inclusion check for this demo. 
            // In production, use range/CIDR matching (e.g. proxy-addr or ip-range-check)
            if (!allowedIps.includes(clientIp)) {
                console.warn(`[Blocked] Unauthorized IP ${clientIp} for Merchant ${merchant.id}`);
                return res.status(403).json({
                    error: 'IP Address not whitelisted',
                    detectedIp: clientIp
                });
            }
        }

        // 3. Verify Body Signature (HMAC-SHA256)
        // Only verify if there is a body and it's not a GET request
        if (req.method !== 'GET' && Object.keys(req.body).length > 0) {
            if (!signature) {
                return res.status(401).json({ error: 'Missing X-Merchant-Signature for state-changing request' });
            }

            // Use req.rawBody if available for absolute consistency (preserves formatting/spacing).
            // Fallback to stringified JSON if rawBody is not set (e.g. not populated by middleware or non-standard content-type).
            const bodyStr = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);
            const expectedSignature = crypto
                .createHmac('sha256', merchant.raw_api_key)
                .update(bodyStr)
                .digest('hex');

            if (signature !== expectedSignature) {
                return res.status(403).json({ error: 'Invalid Payload Signature' });
            }
        }

        req.merchant = merchant;
        next();
    } catch (error) {
        console.error('Authentication Error:', error);
        res.status(500).json({ error: 'Internal Server Error during Authentication' });
    }
};

export const authenticateAdmin = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.header('Authorization');
    const adminSecret = process.env.ADMIN_SECRET || 'antigravity_admin_2024';

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.split(' ')[1];

    if (token !== adminSecret) {
        return res.status(403).json({ error: 'Unauthorized admin access' });
    }

    next();
};
