import { Request, Response } from 'express';
import { query } from '../config/db';
import crypto from 'crypto';
import { createMarketService, settleMarket } from '../services/marketService';
import { ADMIN_SECRET } from '../config/env';

export const createMerchant = async (req: Request, res: Response) => {
    const { name, default_rake } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Merchant name is required' });
    }

    const apiKey = crypto.randomBytes(32).toString('hex');
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    const config = {
        name,
        default_rake: default_rake || 0.05,
        allowed_categories: ['sports', 'general'],
        allowed_ips: [],
        webhook_url: null
    };

    try {
        const result = await query(
            'INSERT INTO merchants (api_key_hash, raw_api_key, config) VALUES ($1, $2, $3) RETURNING id, created_at',
            [apiKeyHash, apiKey, config]
        );

        // Return the RAW API Key
        res.status(201).json({
            id: result.rows[0].id,
            apiKey: apiKey,
            config
        });
    } catch (error: any) {
        console.error('Create Merchant Error:', error);
        res.status(500).json({ error: 'Failed to create merchant' });
    }
};

export const listMerchants = async (req: Request, res: Response) => {
    try {
        const result = await query('SELECT id, raw_api_key, config, created_at FROM merchants ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error: any) {
        console.error('List Merchants Error:', error);
        res.status(500).json({ error: 'Failed to list merchants' });
    }
};

export const createMarket = async (req: Request, res: Response) => {
    const { title, durationSeconds, initYes, initNo, category, term } = req.body;

    if (!title || !durationSeconds) {
        return res.status(400).json({ error: 'Title and durationSeconds are required' });
    }

    try {
        const market = await createMarketService(
            title,
            Number(durationSeconds),
            Number(initYes),
            Number(initNo),
            'Manual Admin Creation',
            0.85,
            undefined,
            category,
            term
        );
        res.status(201).json(market);
    } catch (error: any) {
        console.error('Create Market Error:', error);
        res.status(500).json({ error: 'Failed to create market' });
    }
};

export const listMarkets = async (req: Request, res: Response) => {
    try {
        const result = await query('SELECT * FROM markets ORDER BY id DESC');

        const { Totalisator } = await import('../core/totalisator');

        const markets = result.rows.map(m => {
            const pool = {
                yes: parseFloat(m.pool_yes),
                no: parseFloat(m.pool_no)
            };

            // For admin view, we use a default platform rake or 0 for raw odds
            const rake = 0.05;

            return {
                ...m,
                odds: {
                    yes: Totalisator.calculateOdds(pool, 'yes', rake),
                    no: Totalisator.calculateOdds(pool, 'no', rake)
                },
                probabilities: {
                    yes: pool.yes + pool.no > 0 ? pool.yes / (pool.yes + pool.no) : 0.5,
                    no: pool.yes + pool.no > 0 ? pool.no / (pool.yes + pool.no) : 0.5
                }
            };
        });

        res.json(markets);
    } catch (error: any) {
        console.error('List Markets Error:', error);
        res.status(500).json({ error: 'Failed to list markets' });
    }
};

import { GeminiScout } from '../agent/geminiScout';

// Markets
export const updateMarket = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { title, closure_timestamp, resolution_timestamp, status, category, term } = req.body;

    try {
        const result = await query(
            `UPDATE markets 
             SET title = COALESCE($1, title), 
                 closure_timestamp = COALESCE($2, closure_timestamp), 
                 resolution_timestamp = COALESCE($3, resolution_timestamp),
                 status = COALESCE($4, status),
                 category = COALESCE($5, category),
                 term = COALESCE($6, term)
             WHERE id = $7 RETURNING *`,
            [title, closure_timestamp, resolution_timestamp, status, category, term, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Market not found' });
        }

        res.json(result.rows[0]);
    } catch (error: any) {
        console.error('Update Market Error:', error);
        res.status(500).json({ error: 'Failed to update market' });
    }
};

import { emitMarketDeleted } from '../services/socketService';

export const deleteMarket = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        // Delete wagers first (cascading)
        await query('DELETE FROM wagers WHERE market_id = $1', [id]);
        const result = await query('DELETE FROM markets WHERE id = $1 RETURNING *', [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Market not found' });
        }

        emitMarketDeleted(id);
        res.json({ message: 'Market deleted successfully', market: result.rows[0] });
    } catch (error: any) {
        console.error('Delete Market Error:', error);
        res.status(500).json({ error: 'Failed to delete market' });
    }
};

// Merchants
export const updateMerchant = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { config } = req.body;

    try {
        const result = await query(
            'UPDATE merchants SET config = COALESCE($1, config) WHERE id = $2 RETURNING *',
            [config, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Merchant not found' });
        }

        res.json(result.rows[0]);
    } catch (error: any) {
        console.error('Update Merchant Error:', error);
        res.status(500).json({ error: 'Failed to update merchant' });
    }
};

export const deleteMerchant = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        // Delete wagers first
        await query('DELETE FROM wagers WHERE merchant_id = $1', [id]);
        const result = await query('DELETE FROM merchants WHERE id = $1 RETURNING *', [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Merchant not found' });
        }

        res.json({ message: 'Merchant deleted successfully', merchant: result.rows[0] });
    } catch (error: any) {
        console.error('Delete Merchant Error:', error);
        res.status(500).json({ error: 'Failed to delete merchant' });
    }
};

export const runScout = async (req: Request, res: Response) => {
    const { query: intent, count } = req.body;
    try {
        const scout = new GeminiScout(process.env.GEMINI_API_KEY);
        // We trigger it asynchronously to avoid timeout, but return a message
        scout.run(1, intent, count ? Number(count) : undefined).then(async () => {
            await query("INSERT INTO system_meta (key, value) VALUES ('last_scout_run', $1) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP", [new Date().toISOString()]);
        });

        res.json({ message: 'AI Scout initiated. Markets will appear shortly.' });
    } catch (error: any) {
        console.error('Run Scout Error:', error);
        res.status(500).json({ error: 'Failed to initiate AI Scout' });
    }
};

export const previewScout = async (req: Request, res: Response) => {
    const { query: intent, count } = req.body;
    try {
        const scout = new GeminiScout(process.env.GEMINI_API_KEY);
        const markets = await scout.generateMarkets(intent, count ? Number(count) : undefined);
        res.json(markets);
    } catch (error: any) {
        console.error('Preview Scout Error:', error);
        res.status(500).json({ error: 'Failed to generate preview markets' });
    }
};

export const settleMarketController = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { outcome } = req.body;

    if (!outcome || !['yes', 'no'].includes(outcome.toLowerCase())) {
        return res.status(400).json({ error: 'Valid outcome ("yes" or "no") is required' });
    }

    try {
        const result = await settleMarket(id, outcome.toLowerCase() as 'yes' | 'no');
        res.json(result);
    } catch (error: any) {
        console.error('Settle Market Error:', error);
        res.status(500).json({ error: error.message || 'Failed to settle market' });
    }
};

export const getSystemMeta = async (req: Request, res: Response) => {
    try {
        const result = await query('SELECT * FROM system_meta');
        const meta = result.rows.reduce((acc: any, row: any) => {
            acc[row.key] = row.value;
            return acc;
        }, {});
        res.json(meta);
    } catch (error: any) {
        console.error('Get System Meta Error:', error);
        res.status(500).json({ error: 'Failed to fetch system meta' });
    }
};

export const listWagers = async (req: Request, res: Response) => {
    try {
        const result = await query(`
            SELECT 
                w.*, 
                m.title as market_title,
                COALESCE(merch.config->>'name', 'System Liquidity') as merchant_name
            FROM wagers w
            JOIN markets m ON w.market_id = m.id
            JOIN merchants merch ON w.merchant_id = merch.id
            ORDER BY w.created_at DESC
            LIMIT 100
        `);
        res.json(result.rows || []);
    } catch (error: any) {
        console.error('List Wagers Error:', error);
        res.status(500).json({ error: 'Failed to list wagers' });
    }
};

export const voidMarket = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        // We'll implement voidMarket in marketService
        const { voidMarket: voidMarketService } = await import('../services/marketService');
        const result = await voidMarketService(id);
        res.json(result);
    } catch (error: any) {
        console.error('Void Market Error:', error);
        res.status(500).json({ error: error.message || 'Failed to void market' });
    }
};
export const resolveMarketController = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const { geminiOracle } = await import('../agent/geminiOracle');
        // This is async and might take time, but we trigger it and return success for the trigger
        geminiOracle.resolveMarket(id);
        res.json({ success: true, message: 'AI Oracle resolution triggered' });
    } catch (error: any) {
        console.error('Resolve Market Error:', error);
        res.status(500).json({ error: error.message || 'Failed to trigger AI Oracle' });
    }
};
export const adminLogin = async (req: Request, res: Response) => {
    const { password } = req.body;

    if (password === ADMIN_SECRET) {
        // In a real app, you'd use JWT. For this demo, the secret itself acts as the bearer token.
        // We'll return it so the frontend can store it.
        res.json({ success: true, token: ADMIN_SECRET });
    } else {
        res.status(401).json({ error: 'Invalid admin credentials' });
    }
};

export const getStatsController = async (req: Request, res: Response) => {
    const { date } = req.query;
    const filterDate = date ? new Date(date as string) : new Date();
    const dateStr = filterDate.toISOString().split('T')[0];

    try {
        const { query } = await import('../config/db');

        // Current Open Markets
        const openRes = await query(
            "SELECT COUNT(*) as count FROM markets WHERE status = 'OPEN'"
        );

        // Active Pool (Sum of all pools not yet settled)
        const activeRes = await query(
            "SELECT SUM(total_pool) as sum FROM markets WHERE status NOT IN ('SETTLED', 'VOIDED')"
        );

        // Pool Volume (Total ever or filtered by date if we want 'volume on that day')
        // Let's do 'Total Volume up to that date' for the historical view
        const volumeRes = await query(
            "SELECT SUM(total_pool) as sum FROM markets WHERE created_at <= $1",
            [dateStr + ' 23:59:59']
        );

        // Markets to settle on that specific day
        // resolution_timestamp is bigint ms
        const settleRes = await query(
            "SELECT COUNT(*) as count FROM markets WHERE DATE(TO_TIMESTAMP(resolution_timestamp / 1000.0)) = $1",
            [dateStr]
        );

        // For historical comparison, let's also get 'Active Pool' as it was (estimated)
        // This is hard without history but we can guess: markets created before and settled after.
        const histActiveRes = await query(
            "SELECT SUM(total_pool) as sum FROM markets WHERE created_at <= $1 AND (TO_TIMESTAMP(resolution_timestamp / 1000.0) > $1 OR status NOT IN ('SETTLED', 'VOIDED'))",
            [dateStr + ' 23:59:59']
        );

        res.json({
            open_markets_count: parseInt(openRes.rows[0].count),
            active_pool: parseFloat(activeRes.rows[0].sum || '0'),
            total_volume: parseFloat(volumeRes.rows[0].sum || '0'),
            settle_today_count: parseInt(settleRes.rows[0].count),
            historical_active_pool: parseFloat(histActiveRes.rows[0].sum || '0')
        });
    } catch (error: any) {
        console.error('Stats Error:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch stats' });
    }
};

export const listLogs = async (req: Request, res: Response) => {
    try {
        const { LoggerService } = await import('../services/loggerService');
        const logs = await LoggerService.listLogs();
        res.json(logs);
    } catch (error: any) {
        console.error('List Logs Error:', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
};

export const listWebhookLogs = async (req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT l.*, m.config->>'name' as merchant_name 
             FROM webhook_logs l 
             JOIN merchants m ON l.merchant_id = m.id 
             ORDER BY l.created_at DESC LIMIT 100`
        );
        res.json(result.rows);
    } catch (error: any) {
        console.error('List Webhook Logs Error:', error);
        res.status(500).json({ error: 'Failed to fetch webhook logs' });
    }
};

export const getMarketPayoutSummary = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const { query } = await import('../config/db');

        // 1. Get Market Info
        const marketRes = await query("SELECT * FROM markets WHERE id = $1", [id]);
        if (marketRes.rows.length === 0) return res.status(404).json({ error: 'Market not found' });
        const market = marketRes.rows[0];

        // 2. Get Wager Summaries
        const wagersRes = await query(
            `SELECT w.*, m.config->>'name' as merchant_name 
             FROM wagers w 
             JOIN merchants m ON w.merchant_id = m.id 
             WHERE w.market_id = $1`,
            [id]
        );
        const wagers = wagersRes.rows;

        // 3. Calculate Aggregates
        let totalStake = wagers.reduce((acc, w) => acc + parseFloat(w.stake), 0);
        let totalPayout = wagers.reduce((acc, w) => acc + parseFloat(w.payout || '0'), 0);

        // --- DATA SYNC / FALLBACK ---
        // If wagers are missing (e.g. audit trail gap) but market has pools, 
        // we attribute the difference to System Liquidity for the audit view.
        const marketTotalPool = parseFloat(market.total_pool || '0');
        if (totalStake < marketTotalPool) {
            const diff = marketTotalPool - totalStake;
            totalStake = marketTotalPool;

            // For a settled market, if we are falling back, we assume the diff won or lost 
            // proportional to the market outcome. This is a best-effort audit view.
            if (market.status === 'SETTLED') {
                // Approximate payout if it's missing from wagers but exists in pool
                // If there are no wagers at all, totalPayout will be totalStake if it's a 1:1 or based on odds.
                // Simple fallback: if totalPayout is 0, make it match the pool logic
                if (totalPayout === 0 && marketTotalPool > 0) {
                    totalPayout = marketTotalPool; // Simplification for audit display
                }
            }
        }
        const totalRake = totalStake - totalPayout;

        // 4. Breakdown by Merchant
        const merchantBreakdown = wagers.reduce((acc: any, w) => {
            const mName = w.merchant_name || 'Unknown';
            if (!acc[mName]) acc[mName] = { stake: 0, payout: 0, wagers: 0 };
            acc[mName].stake += parseFloat(w.stake);
            acc[mName].payout += parseFloat(w.payout || '0');
            acc[mName].wagers += 1;
            return acc;
        }, {});

        // Add System Liquidity fallback to breakdown if needed
        if (totalStake > wagers.reduce((acc, w) => acc + parseFloat(w.stake), 0)) {
            const diff = totalStake - wagers.reduce((acc, w) => acc + parseFloat(w.stake), 0);
            if (!merchantBreakdown['System Liquidity']) {
                merchantBreakdown['System Liquidity'] = { stake: 0, payout: 0, wagers: 0 };
            }
            merchantBreakdown['System Liquidity'].stake += diff;
            // Best effort payout fallback for missing wagers
            if (market.status === 'SETTLED' && totalPayout > wagers.reduce((acc, w) => acc + parseFloat(w.payout || '0'), 0)) {
                merchantBreakdown['System Liquidity'].payout += (totalPayout - wagers.reduce((acc, w) => acc + parseFloat(w.payout || '0'), 0));
            }
        }

        res.json({
            market: {
                id: market.id,
                title: market.title,
                status: market.status,
                outcome: market.outcome,
                total_pool: market.total_pool
            },
            summary: {
                total_stake: totalStake,
                total_payout: totalPayout,
                total_rake: totalRake,
                wager_count: wagers.length
            },
            merchant_breakdown: merchantBreakdown
        });
    } catch (error: any) {
        console.error('Payout Summary Error:', error);
        res.status(500).json({ error: 'Failed to fetch payout summary' });
    }
};

export const getTrends = async (req: Request, res: Response) => {
    try {
        const scout = new GeminiScout(process.env.GEMINI_API_KEY);
        const trends = await scout.getTrends();
        res.json(trends);
    } catch (error: any) {
        console.error('Get Trends Error:', error);
        res.status(500).json({ error: 'Failed to fetch trends' });
    }
};
