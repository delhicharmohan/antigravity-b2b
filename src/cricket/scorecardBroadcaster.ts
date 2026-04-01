import { getIo } from '../services/socketService';
import { LoggerService } from '../services/loggerService';
import { TournamentSyncService } from './tournamentSyncService';

/**
 * Transforms raw Roanuz match data (from WebSocket or REST) into
 * clean scorecard payloads, then broadcasts via our Socket.io.
 *
 * Roanuz match data structure:
 * {
 *   key, name, short_name, status, play_status,
 *   teams: { a: { key, code, name }, b: { ... } },
 *   play: {
 *     innings: {
 *       "a_1": { batting_team_key, score: { runs, overs, wickets, run_rate }, batting_order: [...], bowling: [...] },
 *       "b_1": { ... }
 *     },
 *     live: { innings_key, batting_team_key, over, ball, ... },
 *     result: { ... },
 *     related_balls: [ ... ]
 *   },
 *   match_odds: { ... }
 * }
 */
export class ScorecardBroadcaster {

    /**
     * Process an incoming match update and broadcast to all subscribed merchant clients.
     */
    static async broadcast(matchKey: string, data: any): Promise<void> {
        try {
            const scorecard = this.transformScorecard(matchKey, data);

            const io = getIo();

            // Full scorecard to match room
            io.to(`ipl:match:${matchKey}`).emit('scorecard_update', scorecard);

            // Summary to EPL lobby
            io.to('ipl:matches').emit('ipl_match_status', {
                matchKey,
                status: scorecard.status,
                summary: scorecard.summary,
                teams: scorecard.teams,
                score: scorecard.innings.map((i: any) => ({
                    team: i.teamCode,
                    runs: i.runs,
                    wickets: i.wickets,
                    overs: i.overs,
                })),
            });

            // Live ball event (for animations)
            if (scorecard.lastBall) {
                io.to(`ipl:match:${matchKey}`).emit('ball_update', {
                    matchKey,
                    ...scorecard.lastBall,
                });
            }

            // Match odds update
            if (scorecard.matchOdds) {
                io.to(`ipl:match:${matchKey}`).emit('match_odds_update', {
                    matchKey,
                    odds: scorecard.matchOdds,
                });
            }

            // Persist score to database (fire-and-forget)
            const dbStatus = this.mapToDbStatus(data.status, data.play_status);
            TournamentSyncService.updateMatchScore(
                matchKey,
                scorecard.innings,
                dbStatus,
                data.match_odds
            ).catch((err) => {
                LoggerService.error('[Scorecard] DB update failed', {
                    matchKey,
                    error: err?.message,
                });
            });
        } catch (error: any) {
            await LoggerService.error('[Scorecard] Broadcast failed', {
                matchKey,
                error: error?.message,
            });
        }
    }

    /**
     * Transform Roanuz match data → clean scorecard payload.
     */
    private static transformScorecard(matchKey: string, data: any) {
        const teams = {
            a: {
                key: data.teams?.a?.key,
                name: data.teams?.a?.name,
                code: data.teams?.a?.code,
            },
            b: {
                key: data.teams?.b?.key,
                name: data.teams?.b?.name,
                code: data.teams?.b?.code,
            },
        };

        const innings = this.parseInnings(data);
        const lastBall = this.parseLastBall(data);
        const liveInfo = this.parseLiveInfo(data);

        return {
            matchKey,
            status: this.mapToDisplayStatus(data.status, data.play_status),
            teams,
            innings,
            lastBall,
            liveInfo,
            matchOdds: data.match_odds || null,
            result: data.play?.result?.msg || data.result || null,
            summary: this.buildSummary(data, innings),
        };
    }

    /**
     * Parse innings from Roanuz `play.innings` dict.
     * Keys: "a_1" (team A first innings), "b_1" (team B first innings), etc.
     */
    private static parseInnings(data: any): any[] {
        const play = data.play;
        if (!play?.innings) return [];

        const inningsList: any[] = [];

        // Sort keys to maintain order: a_1, b_1, a_2, b_2...
        const keys = Object.keys(play.innings).sort();

        for (const key of keys) {
            const inn = play.innings[key];
            if (!inn) continue;

            const score = inn.score || {};
            const teamKey = inn.batting_team_key;
            const team = this.resolveTeamByKey(data, teamKey);

            // Parse batting order
            const batsmen = (inn.batting_order || [])
                .filter((b: any) => b?.batsman)
                .map((b: any) => ({
                    name: b.batsman.name || b.batsman.jersey_name,
                    playerKey: b.batsman.key,
                    runs: b.score?.runs || 0,
                    balls: b.score?.balls || 0,
                    fours: b.score?.fours || 0,
                    sixes: b.score?.sixes || 0,
                    strikeRate: b.score?.strike_rate || 0,
                    isOut: b.score?.is_out || false,
                    dismissal: b.score?.how_out || null,
                }));

            // Parse bowling
            const bowlers = (inn.bowling || [])
                .filter((b: any) => b?.bowler)
                .map((b: any) => ({
                    name: b.bowler.name || b.bowler.jersey_name,
                    playerKey: b.bowler.key,
                    overs: b.score?.overs || 0,
                    maidens: b.score?.maidens || 0,
                    runs: b.score?.runs || 0,
                    wickets: b.score?.wickets || 0,
                    economy: b.score?.economy || 0,
                }));

            inningsList.push({
                key,
                teamKey,
                teamCode: team.code,
                teamName: team.name,
                runs: score.runs || 0,
                wickets: score.wickets || 0,
                overs: score.overs || 0,
                runRate: score.run_rate || 0,
                extras: score.extras || 0,
                target: inn.target || null,
                batsmen,
                bowlers,
                currentBatsmen: batsmen.filter((b: any) => !b.isOut).slice(-2),
                currentBowler: bowlers.length > 0 ? bowlers[bowlers.length - 1] : null,
            });
        }

        return inningsList;
    }

    /**
     * Parse last ball / related balls from live data.
     */
    private static parseLastBall(data: any): any | null {
        const relatedBalls = data.play?.related_balls;
        if (!relatedBalls || relatedBalls.length === 0) return null;

        const lastBall = relatedBalls[relatedBalls.length - 1];
        if (!lastBall) return null;

        return {
            over: lastBall.over_number,
            ball: lastBall.ball_number,
            innings: lastBall.innings_key,
            runs: lastBall.runs?.total || lastBall.runs || 0,
            type: this.categorizeBall(lastBall),
            commentary: lastBall.commentary || '',
            batsman: lastBall.batsman?.name,
            bowler: lastBall.bowler?.name,
        };
    }

    /**
     * Parse live match state from `play.live`.
     */
    private static parseLiveInfo(data: any): any | null {
        const live = data.play?.live;
        if (!live) return null;

        return {
            inningsKey: live.innings_key,
            battingTeam: live.batting_team_key,
            over: live.over,
            ball: live.ball,
            requiredRunRate: live.required_run_rate,
            currentRunRate: live.current_run_rate,
            projectedScore: live.projected_score,
        };
    }

    /**
     * Categorize a ball event.
     */
    private static categorizeBall(ball: any): string {
        if (ball.wicket) return 'WICKET';
        if (ball.six || ball.runs?.total === 6) return 'SIX';
        if (ball.four || ball.runs?.total === 4) return 'FOUR';
        if (ball.extras?.total > 0) return 'EXTRA';
        if (ball.runs?.total === 0) return 'DOT';
        const runs = ball.runs?.total || 0;
        return `${runs} RUN${runs !== 1 ? 'S' : ''}`;
    }

    /**
     * Build a one-line match summary.
     */
    private static buildSummary(data: any, innings: any[]): string {
        if (data.play?.result?.msg) return data.play.result.msg;
        if (!innings || innings.length === 0) return 'Match not started';

        const current = innings[innings.length - 1];
        return `${current.teamCode}: ${current.runs}/${current.wickets} (${current.overs} ov)`;
    }

    /**
     * Resolve team info from match data.
     */
    private static resolveTeamByKey(data: any, teamKey: string) {
        if (data.teams?.a?.key === teamKey) {
            return { key: teamKey, name: data.teams.a.name, code: data.teams.a.code };
        }
        if (data.teams?.b?.key === teamKey) {
            return { key: teamKey, name: data.teams.b.name, code: data.teams.b.code };
        }
        return { key: teamKey, name: teamKey, code: teamKey };
    }

    private static mapToDisplayStatus(status: string, playStatus?: string): string {
        if (status === 'completed') return 'COMPLETED';
        if (status === 'abandoned') return 'ABANDONED';
        if (playStatus === 'innings_break') return 'INNINGS_BREAK';
        if (playStatus === 'result') return 'RESULT';
        if (status === 'started') return 'LIVE';
        return 'NOT_STARTED';
    }

    private static mapToDbStatus(status: string, playStatus?: string): string {
        if (status === 'completed') return 'COMPLETED';
        if (status === 'abandoned') return 'ABANDONED';
        if (status === 'started') return 'LIVE';
        return 'SCHEDULED';
    }
}
