import { Request, Response } from 'express';
import { query } from '../config/db';
import { Totalisator } from '../core/totalisator';

export const listMarkets = async (req: Request, res: Response) => {
    try {
        const merchant = req.merchant;
        const rake = merchant?.config?.default_rake || 0;
        const { category, term, status } = req.query;

        const targetStatus = status || 'OPEN';
        let sql = "SELECT id, title, category, term, status, closure_timestamp, resolution_timestamp, pool_yes, pool_no, total_pool, source_of_truth, confidence_score " +
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

        sql += " ORDER BY closure_timestamp ASC";

        const result = await query(sql, params);

        // Enhance with real-time odds based on merchant's specific rake
        const markets = result.rows.map(m => {
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
            "SELECT id, title, category, term, status, closure_timestamp, resolution_timestamp, pool_yes, pool_no, total_pool, source_of_truth, confidence_score " +
            "FROM markets WHERE id = $1",
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Market not found' });
        }

        const m = result.rows[0];
        const pool = {
            yes: parseFloat(m.pool_yes),
            no: parseFloat(m.pool_no)
        };

        const market = {
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

        res.json(market);
    } catch (error: any) {
        console.error('Merchant Get Market Error:', error);
        res.status(500).json({ error: 'Failed to fetch market details' });
    }
};
