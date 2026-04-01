import schedule from 'node-schedule';
import { roanuzClient } from './roanuzClient';
import { roanuzSocketManager } from './roanuzSocketManager';
import { TournamentSyncService } from './tournamentSyncService';
import { IPLMarketGenerator } from './iplMarketGenerator';
import { ScorecardBroadcaster } from './scorecardBroadcaster';
import { BallByBallExtractor } from './ballByBallExtractor';
import { LiveContestEngine } from './liveContestEngine';
import { CricketSettlement } from './cricketSettlement';
import { matchSubscribeScheduler } from './matchSubscribeScheduler';
import { restFallbackPoller } from './restFallbackPoller';
import { LoggerService } from '../services/loggerService';

/**
 * Initialize the cricket module:
 * 1. Register WebSocket update pipeline
 * 2. Schedule daily sync and market generation
 * 3. Auto-subscribe to upcoming/live matches
 * 4. Start REST fallback poller
 */
export const initCricketModule = async () => {
    if (!roanuzClient.isConfigured()) {
        LoggerService.warn('[CricketModule] Roanuz API not configured. Skipping cricket module init.');
        return;
    }

    LoggerService.info('[CricketModule] Initializing...');

    // ===== 1. WebSocket Update Pipeline =====
    roanuzSocketManager.onMatchUpdate(async (matchKey, data) => {
        try {
            // Broadcast scorecard to merchants
            await ScorecardBroadcaster.broadcast(matchKey, data);

            // Detect over transitions (Phase 3: micro-contest triggers)
            const transition = BallByBallExtractor.processUpdate(matchKey, data);
            if (transition) {
                LoggerService.info('[CricketModule] Over transition', {
                    matchKey,
                    completed: `${transition.completedInnings}.${transition.completedOver}`,
                    next: `${transition.newInnings}.${transition.newOver}`,
                });
                // Trigger LiveContestEngine for micro-contests
                LiveContestEngine.handleOverTransition(transition, data.play?.related_balls || []);
            }

            // If match completed → settle and unsubscribe
            if (data.status === 'completed') {
                LoggerService.info('[CricketModule] Match completed, settling', { matchKey });
                await CricketSettlement.settleMatchMarkets(matchKey, data);
                await TournamentSyncService.completeMatch(
                    matchKey,
                    data.play?.result?.msg || data.result || '',
                    data.play?.innings || data.innings
                );
                await roanuzSocketManager.unsubscribeMatch(matchKey);
                BallByBallExtractor.resetMatch(matchKey);
            }
        } catch (error: any) {
            LoggerService.error('[CricketModule] Update pipeline error', {
                matchKey,
                message: error?.message,
            });
        }
    });

    // ===== 2. Scheduled Jobs =====

    // Daily tournament + fixture sync at 00:00 IST (18:30 UTC)
    schedule.scheduleJob('cricket-sync', '30 18 * * *', async () => {
        try {
            await TournamentSyncService.fullSync();
            // After sync, schedule subscriptions for new matches
            await matchSubscribeScheduler.scheduleUpcoming();
        } catch (error: any) {
            LoggerService.error('[CricketModule] Scheduled sync failed', { message: error?.message });
        }
    });

    // Daily market generation at 06:00 IST (01:30 UTC)
    schedule.scheduleJob('cricket-markets', '30 1 * * *', async () => {
        try {
            await IPLMarketGenerator.generateTodaysMarkets();
        } catch (error: any) {
            LoggerService.error('[CricketModule] Scheduled market gen failed', { message: error?.message });
        }
    });

    // Every 5 minutes: check for upcoming matches to subscribe + clean up completed ones
    schedule.scheduleJob('cricket-subscribe-check', '*/5 * * * *', async () => {
        try {
            await matchSubscribeScheduler.scheduleUpcoming();
            await matchSubscribeScheduler.cleanupCompleted();
        } catch (error: any) {
            LoggerService.error('[CricketModule] Subscribe check failed', { message: error?.message });
        }
    });

    // ===== 3. Startup Tasks =====

    // Auto-subscribe to currently live matches
    try {
        const liveMatches = await TournamentSyncService.getLiveMatches();
        for (const match of liveMatches) {
            await roanuzSocketManager.subscribeMatch(match.roanuz_key);
        }
        if (liveMatches.length > 0) {
            LoggerService.info('[CricketModule] Auto-subscribed to live matches', {
                count: liveMatches.length,
            });
        }
    } catch (error: any) {
        LoggerService.error('[CricketModule] Auto-subscribe failed', { message: error?.message });
    }

    // Schedule upcoming match subscriptions
    try {
        const scheduled = await matchSubscribeScheduler.scheduleUpcoming();
        if (scheduled > 0) {
            LoggerService.info('[CricketModule] Scheduled upcoming match subscriptions', {
                count: scheduled,
            });
        }
    } catch (error: any) {
        LoggerService.error('[CricketModule] Scheduler init failed', { message: error?.message });
    }

    // ===== 4. REST Fallback Poller =====
    restFallbackPoller.start();

    LoggerService.info('[CricketModule] Initialization complete');
};
