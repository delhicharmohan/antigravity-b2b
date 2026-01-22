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

    if (!['yes', 'no'].includes(selection.toLowerCase())) {
        return res.status(400).json({ error: 'Invalid selection. Must be "yes" or "no".' });
    }

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

        // 3. Insert Wager
        const wagerRes = await client.query(
            `INSERT INTO wagers (merchant_id, market_id, selection, stake, external_user_id, idempotency_key)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [merchant.id, marketId, selection.toLowerCase(), stake, userId, idempotencyKey]
        );
        const wagerId = wagerRes.rows[0].id;

        // 4. Record Transaction
        await client.query(
            `INSERT INTO transactions (merchant_id, type, amount, balance_after, reference_id, description)
             VALUES ($1, 'WAGER', $2, $3, $4, $5)`,
            [merchant.id, stake, newBalance, wagerId, `Wager on market ${marketId}`]
        );

        // Update Market Pool
        const poolCol = selection.toLowerCase() === 'yes' ? 'pool_yes' : 'pool_no';

        const updateRes = await client.query(
            `UPDATE markets 
             SET ${poolCol} = ${poolCol} + $1,
                 volume_24h = volume_24h + $1
             WHERE id = $2
             RETURNING pool_yes, pool_no, total_pool`,
            [stake, marketId]
        );

        await client.query('COMMIT');

        // --- Post-Transaction Logic ---

        const newPool = {
            yes: Number(updateRes.rows[0].pool_yes),
            no: Number(updateRes.rows[0].pool_no)
        };
        const totalPool = Number(updateRes.rows[0].total_pool);

        const merchantRake = merchant.config?.default_rake;
        const yesOdds = Totalisator.calculateOdds(newPool, 'yes', merchantRake);
        const noOdds = Totalisator.calculateOdds(newPool, 'no', merchantRake);

        emitOddsUpdate(marketId, {
            marketId,
            pool_data: newPool,
            total_pool: totalPool,
            odds: { yes: yesOdds, no: noOdds }
        });

        res.status(201).json({
            status: 'accepted',
            wagerId: wagerId,
            marketId,
            stake,
            selection,
            odds: { yes: yesOdds, no: noOdds }
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
