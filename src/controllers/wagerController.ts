import { Request, Response } from 'express';
import { getClient } from '../config/db';
import { emitOddsUpdate } from '../services/socketService';
import { Totalisator } from '../core/totalisator';

export const placeWager = async (req: Request, res: Response) => {
    const { marketId, selection, stake, userId } = req.body;
    const merchant = req.merchant;
    const idempotencyKey = req.header('Idempotency-Key');

    if (!marketId || !selection || !stake || stake <= 0) {
        return res.status(400).json({ error: 'Invalid wager parameters' });
    }

    const normalizedSelection = selection.toLowerCase();

    const client = await getClient();

    try {
        await client.query('BEGIN');

        // 1. Idempotency Check
        if (idempotencyKey) {
            const existingWagerRes = await client.query(
                'SELECT * FROM wagers WHERE merchant_id = $1 AND idempotency_key = $2',
                [merchant.id, idempotencyKey]
            );

            if (existingWagerRes.rows.length > 0) {
                await client.query('ROLLBACK');
                const w = existingWagerRes.rows[0];
                return res.status(200).json({
                    status: 'accepted',
                    wagerId: w.id,
                    marketId: w.market_id,
                    stake: Number(w.stake),
                    selection: w.selection,
                    message: "Idempotent response: Wager already processed"
                });
            }
        }

        // Lock the market row for update to ensure consistency
        const marketRes = await client.query(
            'SELECT * FROM markets WHERE id = $1 FOR UPDATE',
            [marketId]
        );

        if (marketRes.rows.length === 0) {
            throw new Error('Market not found');
        }

        const marketData = marketRes.rows[0];

        if (marketData.status !== 'OPEN') {
            throw new Error(`Market is ${marketData.status.toLowerCase()}. Betting is no longer accepted.`);
        }

        if (Date.now() > Number(marketData.closure_timestamp)) {
            throw new Error('Betting window has closed for this event.');
        }

        // 2. Balance Check & Deduct
        const deductRes = await client.query(
            `UPDATE merchants
             SET balance = balance - $1
             WHERE id = $2 AND balance >= $1
             RETURNING balance`,
            [stake, merchant.id]
        );

        if (deductRes.rows.length === 0) {
            throw new Error('Insufficient funds');
        }

        const newBalance = Number(deductRes.rows[0].balance);

        // --- Security Hardenings ---

        // 1. Cooling-off Period (Anti-Sniping)
        // Block betting 5 minutes before the technical closure timestamp
        const COOLING_OFF_MS = 5 * 60 * 1000;
        if (Date.now() > (Number(marketData.closure_timestamp) - COOLING_OFF_MS)) {
            throw new Error('Market is in cooling-off period. New wagers are no longer accepted.');
        }

        // 2. Liquidity Guard (Anti-Manipulation)
        // Prevent a single bet from exceeding 50% of the CURRENT total pool to avoid extreme odds skew
        const currentTotalPool = Number(marketData.pool_yes) + Number(marketData.pool_no);
        const MAX_WAGER_PERCENT = 0.5;
        // Only apply if there is existing liquidity to avoid blocking initial bets
        if (currentTotalPool > 0 && stake > (currentTotalPool * MAX_WAGER_PERCENT)) {
            throw new Error(`Wager too large relative to pool liquidity. Maximum allowed is ${currentTotalPool * MAX_WAGER_PERCENT}`);
        }

        // 3. Insert Wager
        const wagerRes = await client.query(
            `INSERT INTO wagers (merchant_id, market_id, selection, stake, external_user_id, idempotency_key)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [merchant.id, marketId, normalizedSelection, stake, userId, idempotencyKey]
        );
        const wagerId = wagerRes.rows[0].id;

        // 4. Record Transaction
        await client.query(
            `INSERT INTO transactions (merchant_id, type, amount, balance_after, reference_id, description)
             VALUES ($1, 'WAGER', $2, $3, $4, $5)`,
            [merchant.id, stake, newBalance, wagerId, `Wager on market ${marketId}`]
        );

        // Update Market Pool
        let updateRes;
        
        if (['yes', 'no'].includes(normalizedSelection)) {
            const poolCol = normalizedSelection === 'yes' ? 'pool_yes' : 'pool_no';
            updateRes = await client.query(
                `UPDATE markets 
                 SET ${poolCol} = COALESCE(${poolCol}, 0) + $1,
                     volume_24h = COALESCE(volume_24h, 0) + $1
                 WHERE id = $2
                 RETURNING pool_yes, pool_no, total_pool`,
                [stake, marketId]
            );
        } else {
            // N-way pool (Micro-contests)
            updateRes = await client.query(
                `UPDATE markets 
                 SET pools = jsonb_set(
                     COALESCE(pools, '{}'::jsonb), 
                     array[$1::text], 
                     to_jsonb(COALESCE((pools->>$1::text)::numeric, 0) + $2::numeric)
                 ),
                 volume_24h = COALESCE(volume_24h, 0) + $2
                 WHERE id = $3
                 RETURNING pools, total_pool`,
                [normalizedSelection, stake, marketId]
            );
        }

        await client.query('COMMIT');

        // --- Post-Transaction Logic ---
        const totalPool = Number(updateRes.rows[0].total_pool || 0);
        let newPool: Record<string, number> = {};
        let metrics: Record<string, any> = {};
        const merchantRake = merchant.config?.default_rake;

        if (['yes', 'no'].includes(normalizedSelection)) {
            newPool = {
                yes: Number(updateRes.rows[0].pool_yes || 0),
                no: Number(updateRes.rows[0].pool_no || 0)
            };
            metrics = {
                yes: Totalisator.getMarketMetrics(newPool, 'yes', merchantRake),
                no: Totalisator.getMarketMetrics(newPool, 'no', merchantRake)
            };
        } else {
            newPool = updateRes.rows[0].pools || {};
            // For N-way, we might not want to emit metrics for ALL possible outcomes if there are many,
            // but for micro-contests (6 outcomes), it's fine.
            for (const key of Object.keys(newPool)) {
                metrics[key] = Totalisator.getMarketMetrics(newPool, key, merchantRake);
            }
        }

        emitOddsUpdate(marketId, {
            marketId,
            pool_data: newPool,
            total_pool: totalPool,
            metrics
        });

        res.status(201).json({
            status: 'accepted',
            wagerId: wagerId,
            marketId,
            stake,
            selection: normalizedSelection,
            metrics
        });

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Wager Error:', error);

        let status = 500;
        if (error.message === 'Market not found') status = 404;
        else if (error.message === 'Insufficient funds') status = 402; // Payment Required
        else if (error.message.includes('Market is')) status = 400;
        else status = 400;

        res.status(status).json({ error: error.message || 'Failed to place wager' });
    } finally {
        client.release();
    }
};
