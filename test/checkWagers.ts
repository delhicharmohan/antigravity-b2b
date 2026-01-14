import 'dotenv/config';
import { query } from '../src/config/db';

async function check() {
    try {
        const wagerRes = await query("SELECT COUNT(*) as count FROM wagers");
        console.log("Wager count:", wagerRes.rows[0].count);

        const systemMerchRes = await query("SELECT * FROM merchants WHERE config->>'name' = 'System Liquidity'");
        console.log("System Merchant found:", systemMerchRes.rows.length > 0);
        if (systemMerchRes.rows.length > 0) {
            console.log("System Merchant ID:", systemMerchRes.rows[0].id);
        }

        const sampleWagers = await query("SELECT w.*, m.title FROM wagers w JOIN markets m ON w.market_id = m.id LIMIT 5");
        console.log("Sample Wagers:", JSON.stringify(sampleWagers.rows, null, 2));

    } catch (error) {
        console.error("Check failed:", error);
    } finally {
        process.exit(0);
    }
}

check();
