import schedule from 'node-schedule';
import { query } from '../config/db';
import { roanuzSocketManager } from './roanuzSocketManager';
import { LoggerService } from '../services/loggerService';

/**
 * Manages automatic WebSocket subscription lifecycle:
 * - Subscribe 15 min before match start
 * - Unsubscribe after match completes
 * - Respects the ~20 connection limit
 */
export class MatchSubscribeScheduler {
    private scheduledJobs: Map<string, schedule.Job> = new Map();

    /**
     * Scan for upcoming matches and schedule auto-subscribe.
     * Called on init and daily.
     */
    async scheduleUpcoming(): Promise<number> {
        // Get matches starting in the next 24 hours that aren't yet subscribed
        const result = await query(
            `SELECT id, roanuz_key, start_time, team_a->>'short_name' as team_a, team_b->>'short_name' as team_b
             FROM ipl_matches
             WHERE status = 'SCHEDULED'
               AND start_time BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
             ORDER BY start_time ASC`
        );

        let scheduled = 0;

        for (const match of result.rows) {
            const jobKey = `sub_${match.roanuz_key}`;

            // Skip if already scheduled
            if (this.scheduledJobs.has(jobKey)) continue;

            // Schedule subscribe 15 minutes before match start
            const subscribeTime = new Date(new Date(match.start_time).getTime() - 15 * 60 * 1000);

            // If subscribe time already passed, subscribe now
            if (subscribeTime <= new Date()) {
                await this.subscribeWithLog(match);
                scheduled++;
                continue;
            }

            const job = schedule.scheduleJob(jobKey, subscribeTime, async () => {
                await this.subscribeWithLog(match);
                this.scheduledJobs.delete(jobKey);
            });

            if (job) {
                this.scheduledJobs.set(jobKey, job);
                scheduled++;

                await LoggerService.info('[MatchScheduler] Auto-subscribe scheduled', {
                    match: `${match.team_a} vs ${match.team_b}`,
                    matchKey: match.roanuz_key,
                    subscribeAt: subscribeTime.toISOString(),
                });
            }
        }

        return scheduled;
    }

    /**
     * Subscribe and update status.
     */
    private async subscribeWithLog(match: any): Promise<void> {
        const success = await roanuzSocketManager.subscribeMatch(match.roanuz_key);

        if (success) {
            // Update match status to LIVE if it was SCHEDULED
            await query(
                `UPDATE ipl_matches SET status = 'LIVE' WHERE roanuz_key = $1 AND status = 'SCHEDULED'`,
                [match.roanuz_key]
            );

            await LoggerService.info('[MatchScheduler] Auto-subscribed to match', {
                match: `${match.team_a} vs ${match.team_b}`,
                matchKey: match.roanuz_key,
            });
        }
    }

    /**
     * Clean up completed matches — unsubscribe and free connection slots.
     */
    async cleanupCompleted(): Promise<number> {
        const activeKeys = roanuzSocketManager.getActiveSubscriptions();
        let cleaned = 0;

        for (const matchKey of activeKeys) {
            const result = await query(
                `SELECT status FROM ipl_matches WHERE roanuz_key = $1`,
                [matchKey]
            );

            const status = result.rows[0]?.status;

            if (status === 'COMPLETED' || status === 'ABANDONED') {
                await roanuzSocketManager.unsubscribeMatch(matchKey);
                cleaned++;

                await LoggerService.info('[MatchScheduler] Cleaned up completed match subscription', {
                    matchKey,
                    status,
                });
            }
        }

        return cleaned;
    }

    /**
     * Get scheduler status for dashboard.
     */
    getStatus(): { scheduledJobs: number; activeSubscriptions: number; wsConnected: boolean } {
        return {
            scheduledJobs: this.scheduledJobs.size,
            activeSubscriptions: roanuzSocketManager.getSubscriptionCount(),
            wsConnected: roanuzSocketManager.isSocketConnected(),
        };
    }

    /**
     * Cancel all scheduled jobs (for shutdown).
     */
    cancelAll(): void {
        for (const [key, job] of this.scheduledJobs.entries()) {
            job.cancel();
        }
        this.scheduledJobs.clear();
    }
}

// Singleton
export const matchSubscribeScheduler = new MatchSubscribeScheduler();
