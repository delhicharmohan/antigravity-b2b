import { Request, Response } from 'express';
import { getClient } from '../config/db';
import { emitOddsUpdate } from '../services/socketService';
import { Totalisator } from '../core/totalisator';

export const placeWager = async (req: Request, res: Response) => {
    const { marketId, selection, stake, userId } = req.body;
    const merchant = req.merchant;

    if (!marketId || !selection || !stake || stake <= 0) {
        return res.status(400).json({ error: 'Invalid wager parameters' });
    }

    if (!['yes', 'no'].includes(selection.toLowerCase())) {
        return res.status(400).json({ error: 'Invalid selection. Must be "yes" or "no".' });
    }

    const client = await getClient();

    try {
        await client.query('BEGIN');

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

        // Insert Wager
        const wagerRes = await client.query(
            `INSERT INTO wagers (merchant_id, market_id, selection, stake, external_user_id) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [merchant.id, marketId, selection.toLowerCase(), stake, userId]
        );

        // Update Market Pool
        const poolCol = selection.toLowerCase() === 'yes' ? 'pool_yes' : 'pool_no';

        // Postgres updates decimals as string often, cast explicitly or let driver handle
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
            wagerId: wagerRes.rows[0].id,
            marketId,
            stake,
            selection,
            odds: { yes: yesOdds, no: noOdds }
        });

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Wager Error:', error);
        const status = error.message === 'Market not found' ? 404 : 400;
        res.status(status).json({ error: error.message || 'Failed to place wager' });
    } finally {
        client.release();
    }
};
