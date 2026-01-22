import { Request, Response } from 'express';
import { query } from '../config/db';

export const getBalance = async (req: Request, res: Response) => {
    const merchant = req.merchant;

    try {
        const result = await query('SELECT balance FROM merchants WHERE id = $1', [merchant.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Merchant not found' });
        }
        res.json({ balance: Number(result.rows[0].balance) });
    } catch (error) {
        console.error('Get Balance Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const getTransactions = async (req: Request, res: Response) => {
    const merchant = req.merchant;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    try {
        const result = await query(
            `SELECT * FROM transactions
             WHERE merchant_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [merchant.id, limit, offset]
        );
        res.json(result.rows.map(row => ({
            ...row,
            amount: Number(row.amount),
            balance_after: Number(row.balance_after),
            created_at: new Date(row.created_at).getTime()
        })));
    } catch (error) {
        console.error('Get Transactions Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
