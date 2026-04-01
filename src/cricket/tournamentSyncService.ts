import { query } from '../config/db';
import { roanuzClient } from './roanuzClient';
import { LoggerService } from '../services/loggerService';

export class TournamentSyncService {

    /**
     * Full sync: featured tournaments → fixtures → players (from match API).
     * Called daily at 00:00 IST or manually via admin.
     */
    static async fullSync(): Promise<{ tournaments: number; matches: number; players: number }> {
        await LoggerService.info('[TournamentSync] Starting full sync');

        const stats = { tournaments: 0, matches: 0, players: 0 };

        try {
            // 1. Sync tournament metadata
            const tournamentKeys = await this.syncTournaments();
            stats.tournaments = tournamentKeys.length;

            // 2. For each tournament, sync fixtures
            for (const tournamentKey of tournamentKeys) {
                const matchCount = await this.syncFixtures(tournamentKey);
                stats.matches += matchCount;
            }

            // 3. Sync players from match endpoints (for upcoming/live matches)
            stats.players = await this.syncPlayersFromMatches();

            await LoggerService.info('[TournamentSync] Full sync completed', stats);
            return stats;
        } catch (error: any) {
            await LoggerService.error('[TournamentSync] Full sync failed', {
                message: error?.message,
                stats,
            });
            throw error;
        }
    }

    /**
     * Sync tournaments from featured-tournaments endpoint.
     * Roanuz response: { data: { tournaments: [...] } }
     */
    static async syncTournaments(): Promise<string[]> {
        const response = await roanuzClient.getFeaturedTournaments();
        const tournaments = response?.data?.tournaments || response?.tournaments || [];
        const syncedKeys: string[] = [];

        for (const tournament of tournaments) {
            const key = tournament.key;
            if (!key) continue;

            const name = tournament.name || tournament.short_name || '';

            try {
                await query(
                    `INSERT INTO ipl_tournaments (roanuz_key, name, season, status, start_date, end_date, teams, metadata, synced_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                     ON CONFLICT (roanuz_key) DO UPDATE SET
                         name = EXCLUDED.name,
                         status = EXCLUDED.status,
                         start_date = EXCLUDED.start_date,
                         end_date = EXCLUDED.end_date,
                         teams = EXCLUDED.teams,
                         metadata = EXCLUDED.metadata,
                         synced_at = NOW()`,
                    [
                        key,
                        name,
                        tournament.short_name || null,
                        this.mapTournamentStatus(tournament.status),
                        tournament.start_date ? new Date(tournament.start_date * 1000) : null,
                        tournament.last_scheduled_match_date ? new Date(tournament.last_scheduled_match_date * 1000) : null,
                        JSON.stringify(tournament.teams || []),
                        JSON.stringify({
                            short_name: tournament.short_name,
                            formats: tournament.formats,
                            gender: tournament.gender,
                            countries: tournament.countries,
                        }),
                    ]
                );
                syncedKeys.push(key);
            } catch (error: any) {
                await LoggerService.error('[TournamentSync] Failed to upsert tournament', {
                    key,
                    message: error?.message,
                });
            }
        }

        await LoggerService.info('[TournamentSync] Tournaments synced', { count: syncedKeys.length });
        return syncedKeys;
    }

    /**
     * Sync all fixtures for a tournament.
     * Roanuz response: { data: { matches: [...], next_page_key } }
     * Match structure: { key, name, short_name, sub_title, status, start_at, teams: { a: { key, code, name }, b: {...} }, venue: { name, city } }
     */
    static async syncFixtures(tournamentKey: string): Promise<number> {
        const tournamentResult = await query(
            'SELECT id FROM ipl_tournaments WHERE roanuz_key = $1',
            [tournamentKey]
        );

        if (tournamentResult.rows.length === 0) {
            await LoggerService.warn('[TournamentSync] Tournament not found locally', { tournamentKey });
            return 0;
        }

        const tournamentId = tournamentResult.rows[0].id;
        let matchCount = 0;
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            try {
                const response = await roanuzClient.getTournamentFixtures(tournamentKey, page);
                const matches = response?.data?.matches || response?.matches || [];

                if (matches.length === 0) {
                    hasMore = false;
                    break;
                }

                for (const match of matches) {
                    await this.upsertMatch(tournamentId, match);
                    matchCount++;
                }

                const nextPage = response?.data?.next_page_key;
                if (nextPage) {
                    page++;
                } else {
                    hasMore = false;
                }
            } catch (error: any) {
                await LoggerService.error('[TournamentSync] Fixture page fetch failed', {
                    tournamentKey,
                    page,
                    message: error?.message,
                });
                hasMore = false;
            }
        }

        await LoggerService.info('[TournamentSync] Fixtures synced', { tournamentKey, matchCount });
        return matchCount;
    }

    /**
     * Sync player data by fetching match details for upcoming scheduled matches.
     * Roanuz Match API returns { data: { players: { [key]: { player: { key, name, seasonal_role, roles, ... } } } } }
     */
    static async syncPlayersFromMatches(): Promise<number> {
        // Get upcoming matches that haven't had players synced yet
        const matchesResult = await query(
            `SELECT roanuz_key FROM ipl_matches
             WHERE status IN ('SCHEDULED', 'LIVE')
             ORDER BY start_time ASC LIMIT 20`
        );

        let totalPlayers = 0;

        for (const row of matchesResult.rows) {
            try {
                const response: any = await roanuzClient.getMatch(row.roanuz_key);
                const matchData = response?.data || response;
                const players = matchData?.players;

                if (!players || typeof players !== 'object') continue;

                // Players is a dict: { player_key: { player: { key, name, ... }, team: { key, code } } }
                for (const [playerKey, playerWrapper] of Object.entries(players)) {
                    const pw = playerWrapper as any;
                    const player = pw?.player || pw;
                    if (!player?.key) continue;

                    const teamKey = pw?.team?.key || null;

                    await this.upsertPlayer(player, teamKey);
                    totalPlayers++;
                }
            } catch (error: any) {
                // Non-critical — some matches may not have player data yet
                await LoggerService.warn('[TournamentSync] Match player fetch skipped', {
                    matchKey: row.roanuz_key,
                    message: error?.message,
                });
            }
        }

        await LoggerService.info('[TournamentSync] Players synced from match API', { count: totalPlayers });
        return totalPlayers;
    }

    /**
     * Get today's matches that need pre-match market generation.
     */
    static async getTodaysUnprocessedMatches(): Promise<any[]> {
        const result = await query(
            `SELECT * FROM ipl_matches
             WHERE start_time::date = CURRENT_DATE
               AND prematch_markets_generated = FALSE
               AND status = 'SCHEDULED'
             ORDER BY start_time ASC`
        );
        return result.rows;
    }

    /**
     * Get all live matches.
     */
    static async getLiveMatches(): Promise<any[]> {
        const result = await query(
            `SELECT * FROM ipl_matches WHERE status = 'LIVE' ORDER BY start_time ASC`
        );
        return result.rows;
    }

    /**
     * Update match score from WebSocket data.
     */
    static async updateMatchScore(roanuzKey: string, scoreData: any, status: string, matchOdds?: any): Promise<void> {
        await query(
            `UPDATE ipl_matches SET
                score = $1,
                status = $2,
                match_odds = $3,
                synced_at = NOW()
             WHERE roanuz_key = $4`,
            [JSON.stringify(scoreData), status, matchOdds ? JSON.stringify(matchOdds) : null, roanuzKey]
        );
    }

    /**
     * Mark match as completed with result.
     */
    static async completeMatch(roanuzKey: string, result: string, finalScore: any): Promise<void> {
        await query(
            `UPDATE ipl_matches SET
                status = 'COMPLETED',
                result = $1,
                score = $2,
                synced_at = NOW()
             WHERE roanuz_key = $3`,
            [result, JSON.stringify(finalScore), roanuzKey]
        );
    }

    // ===== Private Helpers =====

    private static async upsertMatch(tournamentId: string, match: any): Promise<void> {
        const key = match.key;
        if (!key) return;

        // Roanuz actual structure:
        // teams: { a: { key, code, name, alternate_name }, b: {...} }
        // venue: { key, name, city, country: { code, name } }
        // sub_title: "1st Match", etc.
        const teamA = match.teams?.a || {};
        const teamB = match.teams?.b || {};

        // Extract match number from sub_title like "1st Match", "2nd Match"
        const matchNumber = this.extractMatchNumber(match.sub_title);

        await query(
            `INSERT INTO ipl_matches (tournament_id, roanuz_key, match_number, team_a, team_b, venue, start_time, status, toss, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
             ON CONFLICT (roanuz_key) DO UPDATE SET
                 match_number = EXCLUDED.match_number,
                 team_a = EXCLUDED.team_a,
                 team_b = EXCLUDED.team_b,
                 venue = EXCLUDED.venue,
                 start_time = EXCLUDED.start_time,
                 status = CASE
                     WHEN ipl_matches.status IN ('COMPLETED', 'ABANDONED') THEN ipl_matches.status
                     ELSE EXCLUDED.status
                 END,
                 toss = COALESCE(EXCLUDED.toss, ipl_matches.toss),
                 synced_at = NOW()`,
            [
                tournamentId,
                key,
                matchNumber,
                JSON.stringify({
                    key: teamA.key,
                    name: teamA.name,
                    short_name: teamA.code || teamA.short_name,
                    alternate_name: teamA.alternate_name,
                }),
                JSON.stringify({
                    key: teamB.key,
                    name: teamB.name,
                    short_name: teamB.code || teamB.short_name,
                    alternate_name: teamB.alternate_name,
                }),
                match.venue?.name ? `${match.venue.name}${match.venue.city ? ', ' + match.venue.city : ''}` : null,
                new Date(match.start_at * 1000),
                this.mapMatchStatus(match.status),
                match.toss ? JSON.stringify(match.toss) : null,
            ]
        );
    }

    private static async upsertPlayer(player: any, teamKey: string | null): Promise<void> {
        const key = player.key;
        if (!key) return;

        await query(
            `INSERT INTO ipl_players (roanuz_key, name, team_key, role, batting_style, bowling_style, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (roanuz_key) DO UPDATE SET
                 name = EXCLUDED.name,
                 team_key = COALESCE(EXCLUDED.team_key, ipl_players.team_key),
                 role = COALESCE(EXCLUDED.role, ipl_players.role),
                 batting_style = COALESCE(EXCLUDED.batting_style, ipl_players.batting_style),
                 bowling_style = COALESCE(EXCLUDED.bowling_style, ipl_players.bowling_style),
                 synced_at = NOW()`,
            [
                key,
                player.name || player.jersey_name || key,
                teamKey,
                player.seasonal_role || (player.roles && player.roles[0]) || null,
                player.batting_style || null,
                player.bowling_style || null,
            ]
        );
    }

    private static extractMatchNumber(subTitle?: string): number | null {
        if (!subTitle) return null;
        const match = subTitle.match(/(\d+)/);
        return match ? parseInt(match[1]) : null;
    }

    private static mapTournamentStatus(status: string): string {
        if (!status) return 'UPCOMING';
        const s = status.toLowerCase();
        if (s.includes('live') || s.includes('started') || s.includes('in_progress')) return 'LIVE';
        if (s.includes('completed') || s.includes('finished')) return 'COMPLETED';
        return 'UPCOMING';
    }

    private static mapMatchStatus(status: string): string {
        if (!status) return 'SCHEDULED';
        const s = status.toLowerCase();
        if (s === 'started' || s.includes('live') || s.includes('in_play')) return 'LIVE';
        if (s === 'completed' || s.includes('result')) return 'COMPLETED';
        if (s.includes('abandoned') || s.includes('cancelled')) return 'ABANDONED';
        if (s === 'not_started') return 'SCHEDULED';
        return 'SCHEDULED';
    }
}
