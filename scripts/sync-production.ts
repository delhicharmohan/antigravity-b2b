import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

/**
 * PRODUCTION DATABASE SYNC SCRIPT
 * 
 * Usage:
 * DATABASE_URL="your_prod_connection_string" npx ts-node scripts/sync-production.ts
 */

async function syncProduction() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
        console.error('ERROR: DATABASE_URL environment variable is required.');
        console.log('Usage: DATABASE_URL="postgres://user:pass@host:port/db?ssl=true" npx ts-node scripts/sync-production.ts');
        process.exit(1);
    }

    console.log('Connecting to production database...');
    const pool = new Pool({
        connectionString,
        ssl: connectionString.includes('render.com') ? { rejectUnauthorized: false } : false
    });

    const client = await pool.connect();

    try {
        console.log('Connected! Reading migration SQL...');

        // We use the consolidated SQL from our synchronization plan
        const migrationSql = `
-- 1. Add balance to merchants
DO $$
BEGIN
    ALTER TABLE merchants ADD COLUMN balance DECIMAL(20, 2) DEFAULT 0;
EXCEPTION
    WHEN duplicate_column THEN NULL;
END $$;

-- 2. Create Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id),
    type VARCHAR(20) NOT NULL CHECK (type IN ('DEPOSIT', 'WITHDRAWAL', 'WAGER', 'PAYOUT', 'REFUND')),
    amount DECIMAL(20, 2) NOT NULL,
    balance_after DECIMAL(20, 2) NOT NULL,
    reference_id UUID,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Add idempotency_key to wagers and index
DO $$
BEGIN
    ALTER TABLE wagers ADD COLUMN idempotency_key VARCHAR(255);
EXCEPTION
    WHEN duplicate_column THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wagers_idempotency ON wagers(merchant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
        `;

        console.log('Executing migration...');
        await client.query('BEGIN');
        await client.query(migrationSql);
        await client.query('COMMIT');

        console.log('SUCCESS: Production database synchronized successfully!');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('FAILED: Migration error:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

syncProduction();
