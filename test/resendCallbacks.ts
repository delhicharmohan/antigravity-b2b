import { Pool } from 'pg';
import axios from 'axios';
import crypto from 'crypto';

/**
 * Retroactive Settlement Callback Resender
 * 
 * Sends `market.settled` webhook callbacks for all settled markets
 * that were missed due to the client.query() bug in settleMarket.
 */

const DATABASE_URL = process.env.DATABASE_URL ||
    'postgresql://antigravity_db_46p6_user:nMOSxp7s6ja27QYX6ebIEgSY6qBL7A1Z@dpg-d5jv7l7fte5s738um71g-a.oregon-postgres.render.com/antigravity_db_46p6';

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function resendCallbacks() {
    console.log('=== Retroactive Settlement Callback Resender ===\n');

    // 1. Get all settled markets
    const marketsRes = await pool.query(
        `SELECT id, title, outcome, created_at FROM markets WHERE status = 'SETTLED' ORDER BY created_at ASC`
    );
    const markets = marketsRes.rows;
    console.log(`Found ${markets.length} settled markets.\n`);

    // 2. Get merchants with webhook URLs (skip System Liquidity)
    const merchantsRes = await pool.query(
        `SELECT id, raw_api_key, config FROM merchants 
         WHERE config->>'webhook_url' IS NOT NULL 
         AND config->>'name' != 'System Liquidity'`
    );
    const merchants = merchantsRes.rows;
    console.log(`Found ${merchants.length} merchant(s) with webhook URLs.\n`);

    if (merchants.length === 0) {
        console.log('No merchants with webhook URLs found. Exiting.');
        await pool.end();
        return;
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const market of markets) {
        const marketId = market.id;
        const outcome = market.outcome;

        // 3. Get wagers for this market (grouped by merchant)
        const wagersRes = await pool.query(
            `SELECT w.*, m.config->>'webhook_url' AS webhook_url, m.raw_api_key, m.config->>'name' AS merchant_name
             FROM wagers w
             JOIN merchants m ON w.merchant_id = m.id
             WHERE w.market_id = $1
             AND m.config->>'webhook_url' IS NOT NULL
             AND m.config->>'name' != 'System Liquidity'`,
            [marketId]
        );

        if (wagersRes.rows.length === 0) {
            skipped++;
            continue;
        }

        // Group wagers by merchant
        const byMerchant: Record<string, any[]> = {};
        for (const w of wagersRes.rows) {
            if (!byMerchant[w.merchant_id]) byMerchant[w.merchant_id] = [];
            byMerchant[w.merchant_id].push(w);
        }

        for (const [merchantId, merchantWagers] of Object.entries(byMerchant)) {
            const firstWager = merchantWagers[0];
            const webhookUrl = firstWager.webhook_url;
            const apiKey = firstWager.raw_api_key;
            const merchantName = firstWager.merchant_name;

            const payload = {
                event: 'market.settled',
                marketId,
                marketStatus: 'SETTLED',
                outcome,
                timestamp: Date.now(),
                retroactive: true, // Flag so merchant knows this is a backfill
                wagers: merchantWagers.map((w: any) => ({
                    wagerId: w.id,
                    userId: w.external_user_id || null,
                    won: w.selection === outcome,
                    payout: parseFloat(w.payout)
                }))
            };

            const bodyStr = JSON.stringify(payload);
            const signature = crypto
                .createHmac('sha256', apiKey)
                .update(bodyStr)
                .digest('hex');

            let responseStatus: number | null = null;
            let responseBody: string | null = null;
            let errorMessage: string | null = null;

            try {
                const response = await axios.post(webhookUrl, payload, {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Webhook-Signature': signature,
                        'X-Merchant-API-Key': apiKey,
                        'User-Agent': 'Antigravity-B2B-Gateway/Backfill'
                    },
                    timeout: 15000
                });
                responseStatus = response.status;
                responseBody = JSON.stringify(response.data).slice(0, 1000);
                sent++;
                console.log(`✅ [${sent}] Sent callback for market "${market.title.slice(0, 60)}..." to ${merchantName} (${responseStatus})`);
            } catch (axiosError: any) {
                responseStatus = axiosError.response?.status || null;
                responseBody = axiosError.response ? JSON.stringify(axiosError.response.data).slice(0, 1000) : null;
                errorMessage = axiosError.message;
                failed++;
                console.error(`❌ [${failed}] Failed for market "${market.title.slice(0, 60)}..." to ${merchantName}: ${axiosError.message}`);
            }

            // Log to webhook_logs table
            await pool.query(
                `INSERT INTO webhook_logs (merchant_id, market_id, event_type, url, payload, response_status, response_body, error_message)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [merchantId, marketId, 'market.settled', webhookUrl, JSON.stringify(payload), responseStatus, responseBody, errorMessage]
            );

            // Small delay to avoid overwhelming the merchant's server
            await new Promise(r => setTimeout(r, 500));
        }
    }

    console.log(`\n=== Complete ===`);
    console.log(`Sent: ${sent} | Failed: ${failed} | Skipped (no merchant wagers): ${skipped}`);

    await pool.end();
}

resendCallbacks().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
