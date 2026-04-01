import { roanuzClient } from './roanuzClient';
import { roanuzSocketManager } from './roanuzSocketManager';
import { ScorecardBroadcaster } from './scorecardBroadcaster';
import { LoggerService } from '../services/loggerService';
import { query } from '../config/db';

/**
 * REST fallback poller for when the WebSocket connection is down.
 * Polls live matches at a 15-second interval via Roanuz REST Match API.
 */
export class RestFallbackPoller {
    private interval: ReturnType<typeof setInterval> | null = null;
    private isRunning = false;
    private pollIntervalMs = 15_000; // 15 seconds

    /**
     * Start polling if WebSocket is disconnected and there are live matches.
     */
    start(): void {
        if (this.isRunning) return;

        this.isRunning = true;
        this.interval = setInterval(() => this.poll(), this.pollIntervalMs);

        LoggerService.info('[FallbackPoller] Started (15s interval)');
    }

    /**
     * Stop polling (called when WebSocket reconnects).
     */
    stop(): void {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.isRunning = false;
        LoggerService.info('[FallbackPoller] Stopped');
    }

    /**
     * One poll cycle: fetch live match data via REST for all subscribed matches.
     * Only runs if WebSocket is disconnected.
     */
    private async poll(): Promise<void> {
        // If WebSocket is connected, no need to poll
        if (roanuzSocketManager.isSocketConnected()) {
            return;
        }

        try {
            const result = await query(
                `SELECT roanuz_key FROM ipl_matches WHERE status = 'LIVE'`
            );

            if (result.rows.length === 0) return;

            await LoggerService.info('[FallbackPoller] Polling via REST (WS down)', {
                matchCount: result.rows.length,
            });

            for (const row of result.rows) {
                try {
                    const response: any = await roanuzClient.getMatch(row.roanuz_key);
                    const matchData = response?.data || response;

                    if (matchData?.key) {
                        // Reuse the same broadcast pipeline
                        await ScorecardBroadcaster.broadcast(matchData.key, matchData);
                    }
                } catch (error: any) {
                    await LoggerService.warn('[FallbackPoller] Match fetch failed', {
                        matchKey: row.roanuz_key,
                        error: error?.message,
                    });
                }
            }
        } catch (error: any) {
            await LoggerService.error('[FallbackPoller] Poll cycle failed', {
                error: error?.message,
            });
        }
    }

    isActive(): boolean {
        return this.isRunning;
    }
}

// Singleton
export const restFallbackPoller = new RestFallbackPoller();
