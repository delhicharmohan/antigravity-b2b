import { query, getClient } from '../config/db';
import { LoggerService } from '../services/loggerService';
import { emitMarketStatusUpdate } from '../services/socketService';
import { Totalisator } from '../core/totalisator';
import { settleMarket } from '../services/marketService';
import { RoanuzMatchData } from './types';

/**
 * Deterministic settlement engine for cricket markets.
 * Reads structured Roanuz match data and resolves markets without AI.
 */
export class CricketSettlement {

    // ===== Pre-Match Market Settlement =====

    static settleMatchWinner(match: RoanuzMatchData, teamAKey: string, teamBKey: string): 'yes' | 'no' | null {
        if (!match.winning_team_key) return null;
        if (match.winning_team_key === teamAKey) return 'yes';
        if (match.winning_team_key === teamBKey) return 'no';
        return null; // Draw or abandoned
    }

    static settleTotalSixes(match: RoanuzMatchData, threshold: number): 'yes' | 'no' | null {
        const innings = match.innings || [];
        if (innings.length === 0) return null;

        let totalSixes = 0;
        // Sum sixes from batsmen data across all innings
        if (match.batsmen) {
            totalSixes = match.batsmen.reduce((sum, b) => sum + (b.sixes || 0), 0);
        }

        return totalSixes >= threshold ? 'yes' : 'no';
    }

    static settleRunsBracket(match: RoanuzMatchData, threshold: number, innings?: number): 'yes' | 'no' | null {
        const inningsData = match.innings || [];
        if (inningsData.length === 0) return null;

        let totalRuns: number;

        if (innings) {
            // Specific innings
            const targetInnings = inningsData[innings - 1];
            if (!targetInnings) return null;
            totalRuns = targetInnings.score;
        } else {
            // All innings combined
            totalRuns = inningsData.reduce((sum, i) => sum + i.score, 0);
        }

        return totalRuns >= threshold ? 'yes' : 'no';
    }

    static settlePlayerRuns(match: RoanuzMatchData, playerKey: string, threshold: number): 'yes' | 'no' | null {
        const batsman = match.batsmen?.find((b) => b.player_key === playerKey);
        if (!batsman) return null;
        return batsman.runs >= threshold ? 'yes' : 'no';
    }

    static settlePlayerWickets(match: RoanuzMatchData, playerKey: string, threshold: number): 'yes' | 'no' | null {
        const bowler = (match as any).bowlers?.find((b: any) => b.player_key === playerKey);
        if (!bowler) return null;
        return bowler.wickets >= threshold ? 'yes' : 'no';
    }

    static settleTopScorer(match: RoanuzMatchData, playerAKey: string, playerBKey: string): 'yes' | 'no' | null {
        const playerA = match.batsmen?.find((b) => b.player_key === playerAKey);
        const playerB = match.batsmen?.find((b) => b.player_key === playerBKey);
        if (!playerA || !playerB) return null;
        if (playerA.runs === playerB.runs) return null; // Tie — void
        return playerA.runs > playerB.runs ? 'yes' : 'no';
    }

    // ===== Micro-Contest Settlement =====

    static settleOverOutcome(balls: any[]): string {
        if (!balls || balls.length === 0) return 'normal';

        const hasWicket = balls.some((b) => b.is_wicket);
        const hasSix = balls.some((b) => b.is_six);
        const hasFour = balls.some((b) => b.is_four);
        const hasExtra = balls.some((b) => b.is_extra);
        const hasDot = balls.some((b) => b.is_dot);

        // Priority: Wicket > Six > Four > Extra > Dot > Normal
        if (hasWicket) return 'wicket';
        if (hasSix) return 'six';
        if (hasFour) return 'four';
        if (hasExtra) return 'extra';
        if (hasDot) return 'dot';
        return 'normal';
    }

    static settleOverRuns(totalRuns: number): string {
        if (totalRuns <= 4) return '0-4';
        if (totalRuns <= 8) return '5-8';
        if (totalRuns <= 12) return '9-12';
        return '13+';
    }

    // ===== Execute Settlement =====

    /**
     * Settle all pre-match markets for a completed match.
     */
    static async settleMatchMarkets(roanuzKey: string, matchData: RoanuzMatchData): Promise<number> {
        // Get all unsettled markets for this match
        const marketsResult = await query(
            `SELECT m.*, im.team_a, im.team_b
             FROM markets m
             JOIN ipl_matches im ON m.ipl_match_id = im.id
             WHERE im.roanuz_key = $1 AND m.status IN ('OPEN', 'CLOSED')`,
            [roanuzKey]
        );

        let settledCount = 0;

        for (const market of marketsResult.rows) {
            try {
                const outcome = this.resolveMarket(market, matchData);
                if (!outcome) {
                    await LoggerService.warn('[CricketSettlement] Could not resolve market', {
                        marketId: market.id,
                        contestType: market.contest_type,
                    });
                    continue;
                }

                await settleMarket(market.id, outcome);
                settledCount++;
            } catch (error: any) {
                await LoggerService.error('[CricketSettlement] Settlement error', {
                    marketId: market.id,
                    message: error?.message,
                });
            }
        }

        await LoggerService.info('[CricketSettlement] Match markets settled', {
            roanuzKey,
            settledCount,
            totalMarkets: marketsResult.rows.length,
        });

        return settledCount;
    }

    /**
     * Determine the outcome for a market based on its contest_type.
     */
    private static resolveMarket(market: any, matchData: RoanuzMatchData): string | null {
        const teamA = typeof market.team_a === 'string' ? JSON.parse(market.team_a) : market.team_a;
        const teamB = typeof market.team_b === 'string' ? JSON.parse(market.team_b) : market.team_b;

        switch (market.contest_type) {
            case 'MATCH_WINNER':
                return this.settleMatchWinner(matchData, teamA.key, teamB.key);

            case 'TOTAL_SIXES': {
                const threshold = market.source_of_truth?.match(/\d+/)?.[0];
                return this.settleTotalSixes(matchData, parseInt(threshold || '12'));
            }

            case 'RUNS_BRACKET': {
                const match = market.title?.match(/(\d+)/);
                const threshold = match ? parseInt(match[1]) : 330;
                return this.settleRunsBracket(matchData, threshold);
            }

            case 'PLAYER_RUNS':
            case 'PLAYER_WICKETS':
            case 'TOP_SCORER':
                // These require settlement params stored in market metadata
                return null; // Will be handled when we add metadata column

            default:
                return null;
        }
    }

}
