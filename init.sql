CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS merchants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_key_hash VARCHAR(255) NOT NULL UNIQUE,
    raw_api_key VARCHAR(255),
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_meta (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Note: Enum creation doesn't support IF NOT EXISTS directly in a nice way without a block
DO $$ BEGIN
    CREATE TYPE market_status AS ENUM ('PENDING', 'OPEN', 'CLOSED', 'RESOLVING', 'SETTLED', 'VOIDED', 'DISPUTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS markets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    status market_status DEFAULT 'PENDING',
    closure_timestamp BIGINT NOT NULL,
    resolution_timestamp BIGINT,
    source_of_truth VARCHAR(255),
    outcome VARCHAR(50),
    confidence_score DECIMAL(3, 2),
    category VARCHAR(100) DEFAULT 'General',
    term VARCHAR(100) DEFAULT 'Ultra Short',
    pool_yes DECIMAL(20, 2) DEFAULT 0,
    pool_no DECIMAL(20, 2) DEFAULT 0,
    pools JSONB DEFAULT '{}',
    total_pool DECIMAL(20, 2) DEFAULT 0,
    volume_24h DECIMAL(20, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migrations for existing tables (in case table was created without these columns)
DO $$ 
BEGIN 
    BEGIN
        ALTER TABLE markets ADD COLUMN category VARCHAR(100) DEFAULT 'General';
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;
    BEGIN
        ALTER TABLE markets ADD COLUMN term VARCHAR(100) DEFAULT 'Ultra Short';
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;
    BEGIN
        ALTER TABLE markets ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;
END $$;

CREATE TABLE IF NOT EXISTS webhook_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id),
    market_id UUID REFERENCES markets(id),
    event_type VARCHAR(50) NOT NULL,
    url TEXT NOT NULL,
    payload JSONB,
    response_status INTEGER,
    response_body TEXT,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wagers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id),
    market_id UUID NOT NULL REFERENCES markets(id),
    selection VARCHAR(50),
    stake DECIMAL(20, 2) NOT NULL CHECK (stake > 0),
    payout DECIMAL(20, 2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'ACCEPTED',
    external_user_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    settled_at TIMESTAMP WITH TIME ZONE
);

-- Migrations for existing wagers table
DO $$ 
BEGIN 
    BEGIN
        ALTER TABLE wagers ADD COLUMN external_user_id VARCHAR(255);
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;
END $$;

CREATE TABLE IF NOT EXISTS system_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    level VARCHAR(10) NOT NULL,
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- === NEW FEATURES ===

-- Add balance to merchants
DO $$
BEGIN
    ALTER TABLE merchants ADD COLUMN balance DECIMAL(20, 2) DEFAULT 0;
EXCEPTION
    WHEN duplicate_column THEN NULL;
END $$;

-- Transactions table
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

-- Add idempotency_key to wagers
DO $$
BEGIN
    ALTER TABLE wagers ADD COLUMN idempotency_key VARCHAR(255);
EXCEPTION
    WHEN duplicate_column THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wagers_idempotency ON wagers(merchant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;


-- Seed Data
-- NOTE: api_key_hash = SHA-256('test_key') = 92488e1e...
INSERT INTO merchants (api_key_hash, raw_api_key, config, balance) VALUES
('92488e1e3eeecdf99f3ed2ce59233efb4b4fb612d5655c0ce9ea52b5a502e655', 'test_key', '{"default_rake": 0.05}', 10000.00)
ON CONFLICT (api_key_hash) DO UPDATE SET
    raw_api_key = EXCLUDED.raw_api_key,
    balance = GREATEST(merchants.balance, EXCLUDED.balance);

-- Sample market with predictable ID for testing if needed
INSERT INTO markets (id, title, status, closure_timestamp, resolution_timestamp, pool_yes, pool_no) VALUES
('00000000-0000-0000-0000-000000000002', 'Test Market: Binary Outcome', 'OPEN', 1893456000000, 1893457000000, 1000, 1000)
ON CONFLICT (id) DO NOTHING;
