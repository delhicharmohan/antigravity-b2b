/**
 * MarketFetcher — Pulls live prediction markets from Polymarket & Kalshi public APIs.
 * No authentication required — both are read-only public endpoints.
 */

export interface ExternalMarket {
    source: 'polymarket' | 'kalshi';
    externalId: string;
    title: string;
    type: 'BINARY' | 'MULTI';
    options?: string[];
    endDate: string;            // ISO timestamp
    volume: number;             // USD volume
    currentOdds: Record<string, number>;
    category?: string;
    url: string;
    sourceOfTruth: string;
}

export class MarketFetcher {

    /**
     * Fetch active markets from Polymarket's Gamma API
     */
    async fetchPolymarket(limit: number = 20): Promise<ExternalMarket[]> {
        const url = `https://gamma-api.polymarket.com/events?active=true&closed=false&limit=${limit}&order=volume24hr&ascending=false`;
        console.log(`[MarketFetcher] Fetching Polymarket events (limit: ${limit})...`);

        try {
            const response = await fetch(url, {
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                console.error(`[MarketFetcher] Polymarket API returned ${response.status}`);
                return [];
            }

            const events: any[] = await response.json();
            const markets: ExternalMarket[] = [];

            for (const event of events) {
                const eventMarkets = event.markets || [];

                if (eventMarkets.length === 0) continue;

                // Single-market event = BINARY, multi-market event = MULTI
                if (eventMarkets.length === 1) {
                    const m = eventMarkets[0];
                    if (!m.active || m.closed) continue;

                    const outcomePrices = JSON.parse(m.outcomePrices || '[]');
                    const yesPrice = parseFloat(outcomePrices[0] || '0.5');
                    const noPrice = parseFloat(outcomePrices[1] || '0.5');

                    markets.push({
                        source: 'polymarket',
                        externalId: m.id || event.id,
                        title: m.question || event.title,
                        type: 'BINARY',
                        endDate: m.endDate || event.endDate,
                        volume: parseFloat(m.volume || '0'),
                        currentOdds: { yes: yesPrice, no: noPrice },
                        category: event.category || undefined,
                        url: `https://polymarket.com/event/${event.slug}`,
                        sourceOfTruth: `https://polymarket.com/event/${event.slug}`
                    });
                } else {
                    // Multi-outcome event
                    const options: string[] = [];
                    const odds: Record<string, number> = {};
                    let totalVolume = 0;

                    for (const m of eventMarkets) {
                        if (!m.active || m.closed) continue;
                        const label = (m.groupItemTitle || m.question || '').trim();
                        if (!label) continue;

                        options.push(label);
                        const outcomePrices = JSON.parse(m.outcomePrices || '[]');
                        odds[label.toLowerCase()] = parseFloat(outcomePrices[0] || '0');
                        totalVolume += parseFloat(m.volume || '0');
                    }

                    if (options.length >= 2) {
                        markets.push({
                            source: 'polymarket',
                            externalId: event.id,
                            title: event.title,
                            type: 'MULTI',
                            options,
                            endDate: event.endDate || eventMarkets[0]?.endDate,
                            volume: totalVolume,
                            currentOdds: odds,
                            category: event.category || undefined,
                            url: `https://polymarket.com/event/${event.slug}`,
                            sourceOfTruth: `https://polymarket.com/event/${event.slug}`
                        });
                    }
                }
            }

            console.log(`[MarketFetcher] Polymarket: ${markets.length} markets fetched`);
            return markets;
        } catch (error: any) {
            console.error(`[MarketFetcher] Polymarket fetch failed:`, error.message);
            return [];
        }
    }

    /**
     * Fetch active events from Kalshi's public Trade API v2
     */
    async fetchKalshi(limit: number = 20): Promise<ExternalMarket[]> {
        const url = `https://api.elections.kalshi.com/trade-api/v2/events?status=open&limit=${limit}&with_nested_markets=true`;
        console.log(`[MarketFetcher] Fetching Kalshi events (limit: ${limit})...`);

        try {
            const response = await fetch(url, {
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                // Try alternate URL
                const altUrl = `https://external-api.kalshi.com/trade-api/v2/events?status=open&limit=${limit}&with_nested_markets=true`;
                const altResponse = await fetch(altUrl, {
                    headers: { 'Accept': 'application/json' }
                });
                if (!altResponse.ok) {
                    console.error(`[MarketFetcher] Kalshi API returned ${altResponse.status}`);
                    return [];
                }
                const data = await altResponse.json();
                return this.parseKalshiEvents(data.events || []);
            }

            const data = await response.json();
            return this.parseKalshiEvents(data.events || []);
        } catch (error: any) {
            console.error(`[MarketFetcher] Kalshi fetch failed:`, error.message);
            return [];
        }
    }

    private parseKalshiEvents(events: any[]): ExternalMarket[] {
        const markets: ExternalMarket[] = [];

        for (const event of events) {
            const eventMarkets = event.markets || [];

            if (eventMarkets.length === 0) continue;

            if (eventMarkets.length === 1) {
                // Binary market
                const m = eventMarkets[0];
                const yesPrice = (m.last_price || m.yes_ask || 50) / 100;
                const noPrice = 1 - yesPrice;

                markets.push({
                    source: 'kalshi',
                    externalId: m.ticker || event.event_ticker,
                    title: m.title || m.subtitle || event.title,
                    type: 'BINARY',
                    endDate: m.expiration_time || m.close_time || event.expected_expiration_time,
                    volume: m.volume || 0,
                    currentOdds: { yes: yesPrice, no: noPrice },
                    category: event.category || undefined,
                    url: `https://kalshi.com/markets/${event.event_ticker}`,
                    sourceOfTruth: `https://kalshi.com/markets/${event.event_ticker}`
                });
            } else {
                // Multi-market event
                const options: string[] = [];
                const odds: Record<string, number> = {};
                let totalVolume = 0;

                for (const m of eventMarkets) {
                    const label = (m.subtitle || m.title || '').trim();
                    if (!label) continue;

                    options.push(label);
                    const yesPrice = (m.last_price || m.yes_ask || 0) / 100;
                    odds[label.toLowerCase()] = yesPrice;
                    totalVolume += m.volume || 0;
                }

                if (options.length >= 2) {
                    markets.push({
                        source: 'kalshi',
                        externalId: event.event_ticker,
                        title: event.title,
                        type: 'MULTI',
                        options: options.slice(0, 8), // Cap at 8 options
                        endDate: event.expected_expiration_time || eventMarkets[0]?.expiration_time,
                        volume: totalVolume,
                        currentOdds: odds,
                        category: event.category || undefined,
                        url: `https://kalshi.com/markets/${event.event_ticker}`,
                        sourceOfTruth: `https://kalshi.com/markets/${event.event_ticker}`
                    });
                }
            }
        }

        console.log(`[MarketFetcher] Kalshi: ${markets.length} markets fetched`);
        return markets;
    }

    /**
     * Fetch from both sources, merged and sorted by volume (highest first)
     */
    async fetchAll(limit: number = 20): Promise<ExternalMarket[]> {
        const [polymarkets, kalshiMarkets] = await Promise.all([
            this.fetchPolymarket(limit),
            this.fetchKalshi(limit)
        ]);

        const combined = [...polymarkets, ...kalshiMarkets];
        combined.sort((a, b) => b.volume - a.volume);

        console.log(`[MarketFetcher] Total: ${combined.length} markets (Polymarket: ${polymarkets.length}, Kalshi: ${kalshiMarkets.length})`);
        return combined;
    }
}
