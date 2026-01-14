import 'dotenv/config';
import { query } from '../src/config/db';

async function migrate() {
    console.log("--- Running Schema Correction Migration ---");

    try {
        // 1. Add missing values to market_status ENUM
        console.log("[Migrate] Updating market_status ENUM...");
        try {
            await query("ALTER TYPE market_status ADD VALUE IF NOT EXISTS 'RESOLVING' AFTER 'CLOSED'");
            await query("ALTER TYPE market_status ADD VALUE IF NOT EXISTS 'DISPUTED' AFTER 'VOIDED'");
        } catch (e: any) {
            console.warn("[Migrate] Note on ENUM update:", e.message);
        }

        // 2. Ensure 'outcome' and 'created_at' columns exist in markets
        console.log("[Migrate] Checking for 'outcome' and 'created_at' columns in markets...");
        await query(`
            ALTER TABLE markets 
            ADD COLUMN IF NOT EXISTS outcome VARCHAR(10) CHECK (outcome IN ('yes', 'no')),
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        `);

        // 3. Ensure 'payout' and 'settled_at' exist in wagers accurately
        console.log("[Migrate] Checking wagers table columns...");
        await query(`
            ALTER TABLE wagers 
            ADD COLUMN IF NOT EXISTS payout DECIMAL(20, 2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS settled_at TIMESTAMP WITH TIME ZONE
        `);

        console.log("✅ Migration Complete.");
    } catch (error) {
        console.error("❌ Migration failed:", error);
    } finally {
        process.exit(0);
    }
}

migrate();
