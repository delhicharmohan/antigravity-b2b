import 'dotenv/config';
import { query } from '../src/config/db';

async function migrate() {
    console.log("--- Running Logging Schema Migration ---");

    try {
        console.log("[Migrate] Creating system_logs table...");
        await query(`
            CREATE TABLE IF NOT EXISTS system_logs (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                level VARCHAR(10) NOT NULL,
                message TEXT NOT NULL,
                details JSONB DEFAULT '{}',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        `);

        // Index for performance on large logs
        await query("CREATE INDEX IF NOT EXISTS idx_logs_created_at ON system_logs(created_at DESC)");

        console.log("✅ Logging Migration Complete.");
    } catch (error) {
        console.error("❌ Migration failed:", error);
    } finally {
        process.exit(0);
    }
}

migrate();
