import axios from 'axios';
import crypto from 'crypto';
import { query } from '../config/db';

export class WebhookService {
    /**
     * Notify a merchant about a market settlement.
     * Follows Indimarket standard: HMAC-SHA256 signature of the body.
     */
    static async notifySettlement(
        merchantId: string,
        marketId: string,
        marketStatus: string,
        outcome: string,
        wagers: any[] = []
    ) {
        try {
            const result = await query('SELECT raw_api_key, config FROM merchants WHERE id = $1', [merchantId]);
            if (result.rowCount === 0) return;

            const merchant = result.rows[0];
            const webhookUrl = merchant.config?.webhook_url;

            if (!webhookUrl) return;

            const payload = {
                event: 'market.settled',
                marketId,
                marketStatus,
                outcome,
                timestamp: Date.now(),
                wagers: wagers.map(w => ({
                    wagerId: w.id,
                    userId: w.external_user_id || null,
                    won: w.selection === outcome,
                    payout: parseFloat(w.payout)
                }))
            };

            const bodyStr = JSON.stringify(payload);
            const signature = crypto
                .createHmac('sha256', merchant.raw_api_key)
                .update(bodyStr)
                .digest('hex');

            console.log(`[Webhook] Delivering settlement to ${webhookUrl} for merchant ${merchantId}...`);

            let responseStatus: number | null = null;
            let responseBody: string | null = null;
            let errorMessage: string | null = null;

            try {
                const response = await axios.post(webhookUrl, payload, {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Webhook-Signature': signature,
                        'X-Merchant-API-Key': merchant.raw_api_key,
                        'User-Agent': 'Antigravity-B2B-Gateway'
                    },
                    timeout: 10000
                });
                responseStatus = response.status;
                responseBody = JSON.stringify(response.data).slice(0, 1000);
                console.log(`[Webhook] Delivered successfully to ${merchantId}`);
            } catch (axiosError: any) {
                responseStatus = axiosError.response?.status || null;
                responseBody = axiosError.response ? JSON.stringify(axiosError.response.data).slice(0, 1000) : null;
                errorMessage = axiosError.message;
                console.error(`[Webhook Error] Failed to delivery to merchant ${merchantId}:`, axiosError.message);
                throw axiosError; // Re-throw to be caught by outer block for global logging if needed
            } finally {
                // Persistent Audit Log
                await query(
                    `INSERT INTO webhook_logs (merchant_id, market_id, event_type, url, payload, response_status, response_body, error_message)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [merchantId, marketId, 'market.settled', webhookUrl, JSON.stringify(payload), responseStatus, responseBody, errorMessage]
                );
            }
        } catch (error: any) {
            // Already logged inside finally or re-thrown
        }
    }
}
