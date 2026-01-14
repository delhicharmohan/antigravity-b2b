import { query } from '../src/config/db';

async function migrate() {
    console.log('🚀 Running Webhook Audit Logs Migration...');

    try {
        await query(`
            CREATE TABLE IF NOT EXISTS webhook_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                merchant_id UUID REFERENCES merchants(id),
                market_id UUID REFERENCES markets(id),
                event_type VARCHAR(50) NOT NULL,
                url TEXT NOT NULL,
                payload JSONB NOT NULL,
                response_status INTEGER,
                response_body TEXT,
                error_message TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_webhook_logs_merchant ON webhook_logs(merchant_id);
            CREATE INDEX IF NOT EXISTS idx_webhook_logs_market ON webhook_logs(market_id);
            CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);
        `);
        console.log('✅ Webhook Audit Logs table and indexes created.');
    } catch (err) {
        console.error('❌ Migration failed:', err);
    }
}

migrate();
