import { Request, Response } from 'express';
import { query } from '../config/db';
import { LoggerService } from '../services/loggerService';
import { TournamentSyncService } from './tournamentSyncService';
import { IPLMarketGenerator } from './iplMarketGenerator';
import { roanuzClient } from './roanuzClient';
import { roanuzSocketManager } from './roanuzSocketManager';
import { matchSubscribeScheduler } from './matchSubscribeScheduler';
import { restFallbackPoller } from './restFallbackPoller';

// ===== Merchant-Facing Endpoints =====

/**
 * GET /v1/ipl/tournaments
 */
export const listTournaments = async (req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT id, roanuz_key, name, season, status, start_date, end_date, teams, created_at
             FROM ipl_tournaments ORDER BY start_date DESC`
        );
        res.json({ tournaments: result.rows });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch tournaments' });
    }
};

/**
 * GET /v1/ipl/matches
 * Query params: date, status, team
 */
export const listMatches = async (req: Request, res: Response) => {
    try {
        const { date, status, team } = req.query;
        let sql = `SELECT * FROM ipl_matches WHERE 1=1`;
        const params: any[] = [];
        let paramIndex = 1;

        if (date) {
            sql += ` AND start_time::date = $${paramIndex++}`;
            params.push(date);
        }

        if (status) {
            sql += ` AND status = $${paramIndex++}`;
            params.push(status);
        }

        if (team) {
            sql += ` AND (team_a->>'key' = $${paramIndex} OR team_b->>'key' = $${paramIndex++})`;
            params.push(team);
        }

        sql += ' ORDER BY start_time ASC';

        const result = await query(sql, params);
        res.json({ matches: result.rows });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch matches' });
    }
};

/**
 * GET /v1/ipl/matches/:matchKey
 */
export const getMatchDetail = async (req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT * FROM ipl_matches WHERE roanuz_key = $1 OR id::text = $1`,
            [req.params.matchKey]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Match not found' });
        }

        res.json({ match: result.rows[0] });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch match detail' });
    }
};

/**
 * GET /v1/ipl/matches/:matchKey/contests
 */
export const getMatchContests = async (req: Request, res: Response) => {
    try {
        const matchResult = await query(
            `SELECT id FROM ipl_matches WHERE roanuz_key = $1 OR id::text = $1`,
            [req.params.matchKey]
        );

        if (matchResult.rows.length === 0) {
            return res.status(404).json({ error: 'Match not found' });
        }

        const matchId = matchResult.rows[0].id;

        const markets = await query(
            `SELECT id, title, status, contest_type, category, term, pool_yes, pool_no, pools, total_pool,
                    closure_timestamp, resolution_timestamp, outcome, created_at
             FROM markets
             WHERE ipl_match_id = $1
             ORDER BY created_at ASC`,
            [matchId]
        );

        res.json({ contests: markets.rows });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch contests' });
    }
};

/**
 * GET /v1/ipl/matches/:matchKey/micro
 */
export const getLiveMicroContests = async (req: Request, res: Response) => {
    try {
        const matchResult = await query(
            `SELECT id FROM ipl_matches WHERE roanuz_key = $1 OR id::text = $1`,
            [req.params.matchKey]
        );

        if (matchResult.rows.length === 0) {
            return res.status(404).json({ error: 'Match not found' });
        }

        const matchId = matchResult.rows[0].id;

        const contests = await query(
            `SELECT mc.*, m.title, m.category, m.term, m.pool_yes, m.pool_no, m.pools, m.total_pool, m.status as market_status
             FROM live_micro_contests mc
             JOIN markets m ON mc.market_id = m.id
             WHERE mc.match_id = $1 AND mc.status IN ('OPEN', 'PENDING')
             ORDER BY mc.over_number DESC, mc.created_at DESC
             LIMIT 5`,
            [matchId]
        );

        res.json({ microContests: contests.rows });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch micro contests' });
    }
};

/**
 * GET /v1/ipl/players
 */
export const listPlayers = async (req: Request, res: Response) => {
    try {
        const { team } = req.query;
        let sql = 'SELECT * FROM ipl_players';
        const params: any[] = [];

        if (team) {
            sql += ' WHERE team_key = $1';
            params.push(team);
        }

        sql += ' ORDER BY name ASC';

        const result = await query(sql, params);
        res.json({ players: result.rows });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch players' });
    }
};

// ===== Admin Endpoints =====

/**
 * POST /admin/ipl/sync — Trigger manual tournament sync
 */
export const triggerSync = async (req: Request, res: Response) => {
    try {
        const stats = await TournamentSyncService.fullSync();
        res.json({ message: 'Sync completed', stats });
    } catch (error: any) {
        await LoggerService.error('[CricketAdmin] Sync failed', { message: error?.message });
        res.status(500).json({ error: 'Sync failed', details: error?.message });
    }
};

/**
 * POST /admin/ipl/generate-markets/:matchKey — Generate pre-match markets
 */
export const generateMarkets = async (req: Request, res: Response) => {
    try {
        const matchResult = await query(
            `SELECT * FROM ipl_matches WHERE roanuz_key = $1 OR id::text = $1`,
            [req.params.matchKey]
        );

        if (matchResult.rows.length === 0) {
            return res.status(404).json({ error: 'Match not found' });
        }

        const count = await IPLMarketGenerator.generateMarketsForMatch(matchResult.rows[0]);
        res.json({ message: 'Markets generated', count });
    } catch (error: any) {
        await LoggerService.error('[CricketAdmin] Market generation failed', { message: error?.message });
        res.status(500).json({ error: 'Market generation failed', details: error?.message });
    }
};

/**
 * POST /admin/ipl/generate-today — Generate markets for all today's matches
 */
export const generateTodaysMarkets = async (req: Request, res: Response) => {
    try {
        const count = await IPLMarketGenerator.generateTodaysMarkets();
        res.json({ message: 'Daily market generation complete', count });
    } catch (error: any) {
        res.status(500).json({ error: 'Daily generation failed', details: error?.message });
    }
};

/**
 * GET /admin/ipl/dashboard — IPL analytics
 */
export const getDashboard = async (req: Request, res: Response) => {
    try {
        const [matchStats, marketStats] = await Promise.all([
            query(`SELECT status, COUNT(*) as count FROM ipl_matches GROUP BY status`),
            query(`SELECT contest_type, status, COUNT(*) as count, SUM(total_pool) as total_volume
                   FROM markets WHERE ipl_match_id IS NOT NULL GROUP BY contest_type, status`),
        ]);

        res.json({
            matches: matchStats.rows,
            markets: marketStats.rows,
            websocket: {
                connected: roanuzSocketManager.isSocketConnected(),
                activeSubscriptions: roanuzSocketManager.getActiveSubscriptions(),
            },
            scheduler: matchSubscribeScheduler.getStatus(),
            fallbackPoller: { active: restFallbackPoller.isActive() },
            apiConfigured: roanuzClient.isConfigured(),
        });
    } catch (error: any) {
        res.status(500).json({ error: 'Dashboard fetch failed' });
    }
};

/**
 * POST /admin/ipl/subscribe/:matchKey — Manually subscribe to a live match WebSocket
 */
export const subscribeToMatch = async (req: Request, res: Response) => {
    try {
        const success = await roanuzSocketManager.subscribeMatch(req.params.matchKey);
        res.json({ subscribed: success, matchKey: req.params.matchKey });
    } catch (error: any) {
        res.status(500).json({ error: 'Subscribe failed', details: error?.message });
    }
};

/**
 * POST /admin/ipl/unsubscribe/:matchKey
 */
export const unsubscribeFromMatch = async (req: Request, res: Response) => {
    try {
        await roanuzSocketManager.unsubscribeMatch(req.params.matchKey);
        res.json({ unsubscribed: true, matchKey: req.params.matchKey });
    } catch (error: any) {
        res.status(500).json({ error: 'Unsubscribe failed', details: error?.message });
    }
};

/**
 * POST /admin/ipl/micro/toggle/:matchKey
 */
export const toggleMicroContests = async (req: Request, res: Response) => {
    const { matchKey } = req.params;
    try {
        // Toggle the flag
        const result = await query(
            `UPDATE ipl_matches 
             SET micro_contests_enabled = NOT COALESCE(micro_contests_enabled, FALSE) 
             WHERE roanuz_key = $1 
             RETURNING micro_contests_enabled`,
            [matchKey]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Match not found' });
        }

        res.json({ 
            matchKey, 
            micro_contests_enabled: result.rows[0].micro_contests_enabled 
        });
    } catch (error: any) {
        res.status(500).json({ error: 'Toggle failed', details: error?.message });
    }
};

/**
 * POST /admin/ipl/micro/enable/:matchKey — Explicitly enable (idempotent)
 */
export const enableMicroContests = async (req: Request, res: Response) => {
    const { matchKey } = req.params;
    try {
        const result = await query(
            `UPDATE ipl_matches 
             SET micro_contests_enabled = TRUE 
             WHERE roanuz_key = $1 
             RETURNING micro_contests_enabled`,
            [matchKey]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Match not found' });
        }

        res.json({
            matchKey,
            micro_contests_enabled: result.rows[0].micro_contests_enabled
        });
    } catch (error: any) {
        res.status(500).json({ error: 'Enable failed', details: error?.message });
    }
};
