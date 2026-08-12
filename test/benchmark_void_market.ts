import { query, getClient } from '../src/config/db';
import { createMarketService, voidMarket } from '../src/services/marketService';

async function benchmark() {
    console.log('--- Void Market Benchmark ---');

    try {
        // 1. Setup: Create a merchant if not exists
        const merchantRes = await query(
            `INSERT INTO merchants (api_key_hash, raw_api_key, config, balance)
             VALUES ('bench_key_hash_2', 'bench_key_2', '{"default_rake": 0.05}', 1000000)
             ON CONFLICT (api_key_hash) DO UPDATE SET balance = 1000000
             RETURNING id`
        );
        const merchantId = merchantRes.rows[0].id;
        console.log(`Merchant ID: ${merchantId}`);

        const wagerCounts = [10, 50, 100]; // Reduced counts for faster execution

        for (const count of wagerCounts) {
            console.log(`\nTesting with ${count} wagers:`);
            // 2. Create a market
            const market = await createMarketService(
                `Bench Market ${count} ${Date.now()}`,
                3600,
                1,
                1
            );
            const marketId = market.id;
            console.log(`Created Market: ${marketId}`);

            // 3. Insert wagers (Batch insertion for speed)
            console.log(`Inserting ${count} wagers...`);
            const values = [];
            for (let i = 0; i < count; i++) {
                values.push(`('${merchantId}', '${marketId}', '${i % 2 === 0 ? 'yes' : 'no'}', 10, 'ACCEPTED')`);
            }
            await query(
                `INSERT INTO wagers (merchant_id, market_id, selection, stake, status) VALUES ${values.join(',')}`
            );

            // 4. Time voidMarket
            console.log(`Voiding market...`);
            const start = performance.now();
            await voidMarket(marketId);
            const end = performance.now();

            console.log(`Result: ${count} wagers took ${(end - start).toFixed(2)}ms`);
        }
    } catch (err) {
        console.error('Benchmark Error:', err);
    }

    process.exit(0);
}

benchmark();
