export interface Merchant {
    id: string;
    api_key_hash: string;
    config: {
        default_rake: number;
        allowed_categories: string[];
    };
    balance: number;
}

export interface MarketGroup {
    id: string;
    title: string;
    description?: string;
    category: string;
    image_url?: string;
    status: 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
    created_at: string;
    markets?: Market[];
}

export interface Market {
    id: string;
    title: string;
    status: 'PENDING' | 'OPEN' | 'CLOSED' | 'SETTLED' | 'VOIDED';
    closure_timestamp: number; // Unix timestamp
    source_of_truth: string;
    pool_data: {
        yes: number; // Volume on YES
        no: number;  // Volume on NO
    };
    total_pool: number; // Derived
    volume_24h: number;
    group_id?: string;
    market_type: 'BINARY' | 'MULTI';
    options: string[];                // e.g. ["India", "China", "Malaysia"]
    pools: Record<string, number>;    // e.g. {"india": 500, "china": 300}
}

export interface Wager {
    id?: string;
    merchant_id: string;
    market_id: string;
    selection: string;  // 'yes'/'no' for BINARY, any option string for MULTI
    stake: number;
    timestamp: number;
    status: 'ACCEPTED' | 'REJECTED';
    idempotency_key?: string;
}

export interface Transaction {
    id: string;
    merchant_id: string;
    type: 'DEPOSIT' | 'WITHDRAWAL' | 'WAGER' | 'PAYOUT' | 'REFUND';
    amount: number;
    balance_after: number;
    reference_id?: string;
    description?: string;
    created_at: number;
}

