import schedule from 'node-schedule';
import { query } from '../config/db';
import { emitMarketStatusUpdate } from './socketService';

export class SchedulerService {
    private static jobs: Map<string, schedule.Job[]> = new Map();

    /**
     * Initializes the scheduler by reloading all active/pending markets from the database.
     */
    public static async init() {
        const { LoggerService } = await import('./loggerService');
        await LoggerService.info('[Scheduler] ⏰ Initializing Precise Event Scheduler...');

        const markets = await query(
            "SELECT id, closure_timestamp, resolution_timestamp, status FROM markets WHERE status IN ('OPEN', 'CLOSED', 'PENDING', 'RESOLVING')"
        );

        for (const market of markets.rows) {
            this.scheduleMarketJobs(market);
        }

        await LoggerService.info(`[Scheduler] ✅ Reloaded jobs for ${markets.rows.length} markets.`, { count: markets.rows.length });
    }

    /**
     * Schedules both closure and resolution jobs for a market.
     */
    public static async scheduleMarketJobs(market: any) {
        const marketId = market.id;
        const now = Date.now();
        const { LoggerService } = await import('./loggerService');

        // 1. Schedule Closure if not already closed
        if (market.status === 'OPEN' || market.status === 'PENDING') {
            const closureTime = Number(market.closure_timestamp);
            if (closureTime > now) {
                this.addJob(marketId, closureTime, async () => {
                    await LoggerService.info(`[Scheduler] 🔒 Triggering Closure for Market ${marketId}`, { marketId });
                    await query("UPDATE markets SET status = 'CLOSED' WHERE id = $1 AND status != 'CLOSED'", [marketId]);
                    emitMarketStatusUpdate(marketId, 'CLOSED');
                });
            } else {
                // Catch-up: Close immediately if missed
                await LoggerService.warn(`[Scheduler] ⏳ catching up missed closure for Market ${marketId}`, { marketId });
                await query("UPDATE markets SET status = 'CLOSED' WHERE id = $1", [marketId]);
                emitMarketStatusUpdate(marketId, 'CLOSED');
            }
        }

        // 2. Schedule Resolution
        const resolutionTime = Number(market.resolution_timestamp);
        if (resolutionTime && market.status !== 'SETTLED' && market.status !== 'VOIDED') {
            if (resolutionTime > now) {
                await LoggerService.info(`[Scheduler] 📅 Scheduled Resolution for Market ${marketId} at ${new Date(resolutionTime).toISOString()}`, { marketId, resolutionTime });
                this.addJob(marketId, resolutionTime, async () => {
                    await LoggerService.info(`[Scheduler] 🏁 Triggering Resolution for Market ${marketId}`, { marketId });
                    await query("UPDATE markets SET status = 'RESOLVING' WHERE id = $1", [marketId]);
                    emitMarketStatusUpdate(marketId, 'RESOLVING');

                    const { geminiOracle } = await import('../agent/geminiOracle');
                    await geminiOracle.resolveMarket(marketId);
                });
            } else if (market.status === 'RESOLVING' || market.status === 'CLOSED') {
                // If the time already passed or it's stuck in RESOLVING, trigger now
                await LoggerService.warn(`[Scheduler] 🔄 Recovering stale/passed resolution for Market ${marketId}`, { marketId, status: market.status });
                (async () => {
                    try {
                        const { geminiOracle } = await import('../agent/geminiOracle');
                        await geminiOracle.resolveMarket(marketId);
                    } catch (e) {
                        console.error(`[Scheduler] ❌ Floating resolution job failed for Market ${marketId}:`, e);
                    }
                })();
            }
        }
    }

    private static addJob(marketId: string, time: number, callback: () => void) {
        const job = schedule.scheduleJob(new Date(time), callback);
        if (!this.jobs.has(marketId)) {
            this.jobs.set(marketId, []);
        }
        this.jobs.get(marketId)?.push(job);
    }

    public static cancelJobs(marketId: string) {
        const jobs = this.jobs.get(marketId);
        if (jobs) {
            jobs.forEach(j => j.cancel());
            this.jobs.delete(marketId);
        }
    }
}
