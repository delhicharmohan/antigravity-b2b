import { Request, Response, NextFunction } from 'express';
import { query } from '../config/db';
import crypto from 'crypto';

// Extend Express Request to include merchant data
declare global {
    namespace Express {
        interface Request {
            merchant?: any;
        }
    }
}

/**
 * Check if an IPv4 address is within a CIDR range (e.g. 74.220.48.0/24).
 */
function isIpInCidr(ip: string, cidr: string): boolean {
    try {
        const [range, bits] = cidr.split('/');
        const mask = ~(2 ** (32 - parseInt(bits)) - 1) >>> 0;
        const ipNum = ipToInt(ip);
        const rangeNum = ipToInt(range);
        return (ipNum & mask) === (rangeNum & mask);
    } catch {
        return false;
    }
}

function ipToInt(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
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

        // 2. IP Whitelisting with CIDR Subnet Support
        const allowedIps = merchant.config?.allowed_ips;
        if (allowedIps && Array.isArray(allowedIps) && allowedIps.length > 0) {
            let clientIp = req.ip || req.socket.remoteAddress || '';
            // Strip IPv6-mapped prefix (e.g. ::ffff:1.2.3.4 -> 1.2.3.4)
            if (clientIp.startsWith('::ffff:')) {
                clientIp = clientIp.slice(7);
            }

            const isAllowed = allowedIps.some((entry: string) => {
                if (entry.includes('/')) {
                    return isIpInCidr(clientIp, entry);
                }
                return clientIp === entry;
            });

            if (!isAllowed) {
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

            // In production, use req.rawBody if possible for absolute consistency.
            // Here we use stringified JSON which expects consistent formatting from client.
            const bodyStr = JSON.stringify(req.body);
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
