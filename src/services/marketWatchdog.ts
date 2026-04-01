import { query } from '../config/db';
import { geminiOracle } from '../agent/geminiOracle';
import { closeMarket } from './marketService';
import { LoggerService } from './loggerService';

export class MarketWatchdog {
    private static isRunning = false;
    private static CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

    public static start() {
        LoggerService.info('[Watchdog] 🐕 Market Watchdog started.');
        // Run immediately on startup
        this.checkOpenMarkets();
        // Then every 5 minutes
        setInterval(() => this.checkOpenMarkets(), this.CHECK_INTERVAL_MS);
    }

    private static async checkOpenMarkets() {
        if (this.isRunning) return;
        this.isRunning = true;

        try {
            // 1. Fetch OPEN markets that are NOT marked as 'long-term' or something that shouldn't be checked?
            // For now, check all OPEN markets.
            const res = await query(
                `SELECT id, title, closure_timestamp, category FROM markets 
                 WHERE status = 'OPEN' 
                 ORDER BY created_at DESC 
                 LIMIT 50` // Limit batch size to avoid overwhelming Gemini
            );

            const markets = res.rows;
            if (markets.length === 0) return;

            LoggerService.info(`[Watchdog] Checking ${markets.length} open markets for early start...`);

            // 2. Filter for potential sports events ("vs", "beat", "win", "match")
            const sportsKeywords = [' vs ', ' beat ', ' win ', ' match ', ' against '];
            const sportsMarkets = markets.filter(m =>
                sportsKeywords.some(k => m.title.toLowerCase().includes(k))
            );

            // 3. Check start times (Concurrent limit: 3 at a time)
            const CONCURRENCY = 3;
            for (let i = 0; i < sportsMarkets.length; i += CONCURRENCY) {
                const batch = sportsMarkets.slice(i, i + CONCURRENCY);
                await Promise.all(batch.map(m => this.checkAndClose(m)));

                // Small delay between batches
                await new Promise(r => setTimeout(r, 2000));
            }

        } catch (error: any) {
            LoggerService.error(`[Watchdog] Error in monitoring loop: ${error.message}`);
        } finally {
            this.isRunning = false;
        }
    }

    private static async checkAndClose(market: any) {
        try {
            const actualStart = await geminiOracle.getEventStartTime(market.title);
            if (!actualStart) return;

            const now = Date.now();
            const scheduledClosure = Number(market.closure_timestamp);

            // Buffer: If the event started more than 2 minutes ago, close it.
            // (Allow small 2-min buffer for "toss" or pre-match delays)
            const BUFFER_MS = 2 * 60 * 1000;

            if (actualStart < (now - BUFFER_MS)) {
                // Event definitely started in the past
                if (actualStart < scheduledClosure) {
                    LoggerService.warn(`[Watchdog] 🚨 Market ${market.id} event started at ${new Date(actualStart).toISOString()} (Now: ${new Date(now).toISOString()}). Closing immediately!`, {
                        marketId: market.id,
                        title: market.title,
                        startTime: new Date(actualStart).toISOString()
                    });

                    await closeMarket(market.id);
                }
            } else {
                // Event hasn't started yet, or just started. 
                // Optional: Update closure_timestamp if it's significantly wrong? 
                // For now, let's just close if it *has* started.
            }

        } catch (e: any) {
            console.error(`[Watchdog] Failed check for ${market.id}:`, e.message);
        }
    }
}
