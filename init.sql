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
    outcome VARCHAR(10) CHECK (outcome IN ('yes', 'no')),
    confidence_score DECIMAL(3, 2),
    pool_yes DECIMAL(20, 2) DEFAULT 0,
    pool_no DECIMAL(20, 2) DEFAULT 0,
    total_pool DECIMAL(20, 2) GENERATED ALWAYS AS (pool_yes + pool_no) STORED,
    volume_24h DECIMAL(20, 2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS wagers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id),
    market_id UUID NOT NULL REFERENCES markets(id),
    selection VARCHAR(10) CHECK (selection IN ('yes', 'no')),
    stake DECIMAL(20, 2) NOT NULL CHECK (stake > 0),
    payout DECIMAL(20, 2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'ACCEPTED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    settled_at TIMESTAMP WITH TIME ZONE
);

-- Seed Data
INSERT INTO merchants (api_key_hash, raw_api_key, config) VALUES 
('62c66221e60cc0d091bc3e12a8de7a6bc4dfeb93967d3f29da44dad679549344', 'test_key', '{"default_rake": 0.05}')
ON CONFLICT (api_key_hash) DO NOTHING;

-- Sample market with predictable ID for testing if needed
INSERT INTO markets (id, title, status, closure_timestamp, resolution_timestamp, pool_yes, pool_no) VALUES
('00000000-0000-0000-0000-000000000001', 'Test Market: Binary Outcome', 'OPEN', 1893456000000, 1893457000000, 1000, 1000)
ON CONFLICT (id) DO NOTHING;
