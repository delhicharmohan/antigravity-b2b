export interface Merchant {
    id: string;
    api_key_hash: string;
    config: {
        default_rake: number;
        allowed_categories: string[];
    };
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
}

export interface Wager {
    id?: string;
    merchant_id: string;
    market_id: string;
    selection: 'yes' | 'no';
    stake: number;
    timestamp: number;
    status: 'ACCEPTED' | 'REJECTED';
}
