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


-- ===== IPL Cricket Market Tables =====

-- IPL Tournaments
CREATE TABLE IF NOT EXISTS ipl_tournaments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    roanuz_key VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    season VARCHAR(10),
    status VARCHAR(20) DEFAULT 'UPCOMING',
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    teams JSONB,
    metadata JSONB,
    synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- IPL Matches
CREATE TABLE IF NOT EXISTS ipl_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID REFERENCES ipl_tournaments(id),
    roanuz_key VARCHAR(100) UNIQUE NOT NULL,
    match_number INT,
    team_a JSONB NOT NULL,
    team_b JSONB NOT NULL,
    venue VARCHAR(255),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) DEFAULT 'SCHEDULED',
    toss JSONB,
    score JSONB,
    result VARCHAR(500),
    match_odds JSONB,
    prematch_markets_generated BOOLEAN DEFAULT FALSE,
    micro_contests_enabled BOOLEAN DEFAULT FALSE,
    contest_group_id UUID,
    synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ipl_matches_start ON ipl_matches(start_time);
CREATE INDEX IF NOT EXISTS idx_ipl_matches_status ON ipl_matches(status);

-- IPL Players
CREATE TABLE IF NOT EXISTS ipl_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    roanuz_key VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    team_key VARCHAR(100),
    role VARCHAR(50),
    batting_style VARCHAR(50),
    bowling_style VARCHAR(50),
    stats JSONB,
    synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Live Micro-Contests (per-over markets)
CREATE TABLE IF NOT EXISTS live_micro_contests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID REFERENCES ipl_matches(id),
    market_id UUID REFERENCES markets(id),
    over_number INT NOT NULL,
    innings INT NOT NULL,
    contest_type VARCHAR(30) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    opened_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    actual_outcome JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_micro_live ON live_micro_contests(match_id, status);

-- Add IPL reference to existing markets table
DO $$
BEGIN
    BEGIN
        ALTER TABLE markets ADD COLUMN ipl_match_id UUID REFERENCES ipl_matches(id);
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;
    BEGIN
        ALTER TABLE markets ADD COLUMN contest_type VARCHAR(30);
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;
END $$;

-- Seed Data
-- NOTE: api_key_hash = SHA-256('test_key') = 92488e1e...
INSERT INTO merchants (api_key_hash, raw_api_key, config, balance) VALUES
('92488e1e3eeecdf99f3ed2ce59233efb4b4fb612d5655c0ce9ea52b5a502e655', 'test_key', '{"default_rake": 0.05}', 10000.00)
ON CONFLICT (api_key_hash) DO UPDATE SET
    raw_api_key = EXCLUDED.raw_api_key,
    balance = GREATEST(merchants.balance, EXCLUDED.balance);

-- System Liquidity merchant for IPL market seeding (fixed UUID)
INSERT INTO merchants (id, api_key_hash, raw_api_key, config) VALUES
('00000000-0000-0000-0000-000000000001', 'system_ipl_liquidity_v1', 'system_ipl_key', '{"name": "System Liquidity (IPL)"}')
ON CONFLICT (id) DO NOTHING;

-- Sample market with predictable ID for testing if needed
INSERT INTO markets (id, title, status, closure_timestamp, resolution_timestamp, pool_yes, pool_no) VALUES
('00000000-0000-0000-0000-000000000002', 'Test Market: Binary Outcome', 'OPEN', 1893456000000, 1893457000000, 1000, 1000)
ON CONFLICT (id) DO NOTHING;
