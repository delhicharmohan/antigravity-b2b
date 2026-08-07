import { Request, Response } from 'express';
import { query } from '../config/db';
import { Totalisator } from '../core/totalisator';

export const listMarkets = async (req: Request, res: Response) => {
    try {
        const merchant = req.merchant;
        const rake = merchant?.config?.default_rake || 0;
        const { category, term, status, market_type } = req.query;

        const targetStatus = status || 'OPEN';
        let sql = "SELECT id, title, category, term, status, closure_timestamp, resolution_timestamp, pool_yes, pool_no, pools, total_pool, source_of_truth, confidence_score, market_type, options, group_id " +
            "FROM markets WHERE status = $1";
        const params: any[] = [targetStatus];

        if (category) {
            params.push(category);
            sql += ` AND category = $${params.length}`;
        }

        if (term) {
            params.push(term);
            sql += ` AND term = $${params.length}`;
        }

        if (market_type) {
            params.push((market_type as string).toUpperCase());
            sql += ` AND market_type = $${params.length}`;
        }

        sql += " ORDER BY closure_timestamp ASC";

        const result = await query(sql, params);

        // Enhance with real-time odds based on merchant's specific rake
        const markets = result.rows.map(m => {
            const mType = m.market_type || 'BINARY';

            if (mType === 'MULTI') {
                const poolData: Record<string, number> = {};
                const rawPools = m.pools || {};
                for (const key of Object.keys(rawPools)) {
                    poolData[key] = Number(rawPools[key]);
                }
                const poolTotal = Object.values(poolData).reduce((sum, val) => sum + val, 0);

                const metrics: Record<string, any> = {};
                for (const key of Object.keys(poolData)) {
                    metrics[key] = Totalisator.getMarketMetrics(poolData, key, rake);
                }

                return {
                    ...m,
                    pool_data: poolData,
                    odds: metrics,
                    metrics,
                    probabilities: Object.fromEntries(
                        Object.keys(poolData).map(k => [k, poolTotal > 0 ? poolData[k] / poolTotal : 1 / Math.max(Object.keys(poolData).length, 1)])
                    )
                };
            } else {
                const pool = {
                    yes: parseFloat(m.pool_yes),
                    no: parseFloat(m.pool_no)
                };

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
            }
        });

        res.json(markets);
    } catch (error: any) {
        console.error('Merchant List Markets Error:', error);
        res.status(500).json({ error: 'Failed to fetch markets' });
    }
};

export const getMarketDetails = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const merchant = req.merchant;
        const rake = merchant?.config?.default_rake || 0;

        const result = await query(
            "SELECT id, title, category, term, status, closure_timestamp, resolution_timestamp, pool_yes, pool_no, pools, total_pool, source_of_truth, confidence_score, market_type, options, group_id " +
            "FROM markets WHERE id = $1",
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Market not found' });
        }

        const m = result.rows[0];
        const mType = m.market_type || 'BINARY';

        let market: any;

        if (mType === 'MULTI') {
            const poolData: Record<string, number> = {};
            const rawPools = m.pools || {};
            for (const key of Object.keys(rawPools)) {
                poolData[key] = Number(rawPools[key]);
            }
            const poolTotal = Object.values(poolData).reduce((sum, val) => sum + val, 0);

            const metrics: Record<string, any> = {};
            for (const key of Object.keys(poolData)) {
                metrics[key] = Totalisator.getMarketMetrics(poolData, key, rake);
            }

            market = {
                ...m,
                pool_data: poolData,
                odds: metrics,
                metrics,
                probabilities: Object.fromEntries(
                    Object.keys(poolData).map(k => [k, poolTotal > 0 ? poolData[k] / poolTotal : 1 / Math.max(Object.keys(poolData).length, 1)])
                )
            };
        } else {
            const pool = {
                yes: parseFloat(m.pool_yes),
                no: parseFloat(m.pool_no)
            };

            market = {
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
        }

        res.json(market);
    } catch (error: any) {
        console.error('Merchant Get Market Error:', error);
        res.status(500).json({ error: 'Failed to fetch market details' });
    }
};

// ============================================================
// Market Groups (Merchant-facing)
// ============================================================

export const listMarketGroups = async (req: Request, res: Response) => {
    try {
        const merchant = req.merchant;
        const rake = merchant?.config?.default_rake || 0;

        const groupsRes = await query(
            `SELECT * FROM market_groups WHERE status = 'ACTIVE' ORDER BY created_at DESC`
        );
        const groups = groupsRes.rows;

        if (groups.length === 0) return res.json([]);

        // Fetch OPEN markets that belong to groups
        const marketsRes = await query(
            `SELECT * FROM markets WHERE group_id IS NOT NULL AND status = 'OPEN' ORDER BY created_at ASC`
        );

        // Attach markets to their groups with odds
        const marketsByGroup: Record<string, any[]> = {};
        for (const m of marketsRes.rows) {
            if (!marketsByGroup[m.group_id]) marketsByGroup[m.group_id] = [];

            const mType = m.market_type || 'BINARY';
            if (mType === 'MULTI') {
                const poolData: Record<string, number> = {};
                const rawPools = m.pools || {};
                for (const key of Object.keys(rawPools)) poolData[key] = Number(rawPools[key]);
                const poolTotal = Object.values(poolData).reduce((sum, val) => sum + val, 0);
                const metrics: Record<string, any> = {};
                for (const key of Object.keys(poolData)) metrics[key] = Totalisator.getMarketMetrics(poolData, key, rake);

                marketsByGroup[m.group_id].push({
                    ...m, pool_data: poolData, odds: metrics, metrics,
                    probabilities: Object.fromEntries(Object.keys(poolData).map(k => [k, poolTotal > 0 ? poolData[k] / poolTotal : 1 / Math.max(Object.keys(poolData).length, 1)]))
                });
            } else {
                const pool = { yes: parseFloat(m.pool_yes), no: parseFloat(m.pool_no) };
                marketsByGroup[m.group_id].push({
                    ...m,
                    odds: { yes: Totalisator.calculateOdds(pool, 'yes', rake), no: Totalisator.calculateOdds(pool, 'no', rake) },
                    probabilities: { yes: pool.yes + pool.no > 0 ? pool.yes / (pool.yes + pool.no) : 0.5, no: pool.yes + pool.no > 0 ? pool.no / (pool.yes + pool.no) : 0.5 }
                });
            }
        }

        const result = groups
            .map((g: any) => ({ ...g, markets: marketsByGroup[g.id] || [] }))
            .filter((g: any) => g.markets.length > 0); // Only return groups with active markets

        res.json(result);
    } catch (error: any) {
        console.error('Merchant List Market Groups Error:', error);
        res.status(500).json({ error: 'Failed to fetch market groups' });
    }
};

export const getMarketGroupDetails = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const merchant = req.merchant;
        const rake = merchant?.config?.default_rake || 0;

        const groupRes = await query(`SELECT * FROM market_groups WHERE id = $1`, [id]);
        if (groupRes.rows.length === 0) return res.status(404).json({ error: 'Market group not found' });

        const group = groupRes.rows[0];

        const marketsRes = await query(
            `SELECT * FROM markets WHERE group_id = $1 ORDER BY created_at ASC`,
            [id]
        );

        const markets = marketsRes.rows.map((m: any) => {
            const mType = m.market_type || 'BINARY';
            if (mType === 'MULTI') {
                const poolData: Record<string, number> = {};
                const rawPools = m.pools || {};
                for (const key of Object.keys(rawPools)) poolData[key] = Number(rawPools[key]);
                const poolTotal = Object.values(poolData).reduce((sum, val) => sum + val, 0);
                const metrics: Record<string, any> = {};
                for (const key of Object.keys(poolData)) metrics[key] = Totalisator.getMarketMetrics(poolData, key, rake);
                return { ...m, pool_data: poolData, odds: metrics, metrics, probabilities: Object.fromEntries(Object.keys(poolData).map(k => [k, poolTotal > 0 ? poolData[k] / poolTotal : 1 / Math.max(Object.keys(poolData).length, 1)])) };
            } else {
                const pool = { yes: parseFloat(m.pool_yes), no: parseFloat(m.pool_no) };
                return { ...m, odds: { yes: Totalisator.calculateOdds(pool, 'yes', rake), no: Totalisator.calculateOdds(pool, 'no', rake) }, probabilities: { yes: pool.yes + pool.no > 0 ? pool.yes / (pool.yes + pool.no) : 0.5, no: pool.yes + pool.no > 0 ? pool.no / (pool.yes + pool.no) : 0.5 } };
            }
        });

        res.json({ ...group, markets });
    } catch (error: any) {
        console.error('Merchant Get Market Group Error:', error);
        res.status(500).json({ error: 'Failed to fetch market group details' });
    }
};
