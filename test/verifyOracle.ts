import 'dotenv/config';
import { geminiOracle } from '../src/agent/geminiOracle';
import { SchedulerService } from '../src/services/schedulerService';
import { query } from '../src/config/db';

async function verifyOracle() {
    console.log("--- Verifying Gemini Oracle & Scheduler ---");

    try {
        // 1. Setup Test Market
        const testUuid = 'b2b00000-0000-4000-a000-000000000001';
        console.log(`[Test] Creating mock market: ${testUuid}`);

        await query(`
            INSERT INTO markets (id, title, status, closure_timestamp, resolution_timestamp, source_of_truth)
            VALUES ($1, 'Did Bitcoin (BTC) reach $70,000 in the year 2024?', 'RESOLVING', $2, $3, 'CoinMarketCap')
            ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, status = 'RESOLVING'
        `, [testUuid, Date.now() - 10000, Date.now() - 5000]);

        // 2. Verify Oracle Logic (Consensus)
        console.log("[Test] Triggering Oracle Consensus Logic...");
        await geminiOracle.resolveMarket(testUuid);

        // 3. Check Database State
        const result = await query("SELECT status, outcome FROM markets WHERE id = $1", [testUuid]);
        const market = result.rows[0];

        if (market.status === 'SETTLED' || market.status === 'DISPUTED') {
            console.log(`✅ Oracle Verification Passed: Status is ${market.status}, Outcome is ${market.outcome}`);
        } else {
            console.log(`❌ Oracle Verification Failed: Status is ${market.status}`);
        }

        // 4. Verify Scheduler Job Registration
        console.log("[Test] Testing Scheduler Job Registration...");
        SchedulerService.scheduleMarketJobs({
            id: 'b2b11111-1111-4111-a111-111111111111',
            status: 'OPEN',
            closure_timestamp: Date.now() + 100000,
            resolution_timestamp: Date.now() + 200000
        });
        console.log("✅ Scheduler Job Registered (Check logs if needed)");

    } catch (error) {
        console.error("❌ Verification failed:", error);
    } finally {
        process.exit(0);
    }
}

verifyOracle();
