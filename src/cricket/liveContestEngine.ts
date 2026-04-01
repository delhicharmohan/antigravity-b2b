import { query } from '../config/db';
import { LoggerService } from '../services/loggerService';
import { emitMicroContestOpen, emitMicroContestSettled } from '../services/socketService';
import { settleMarket } from '../services/marketService';
import { OverTransitionEvent, BallByBallExtractor, OverOutcome } from './ballByBallExtractor';
import { CricketSettlement } from './cricketSettlement';

export class LiveContestEngine {
    
    /**
     * Handled by `init.ts` when BallByBallExtractor detects an over transition.
     */
    static async handleOverTransition(transition: OverTransitionEvent, relatedBalls: any[]): Promise<void> {
        try {
            // 1. Get Match ID and Settings
            const matchRes = await query('SELECT id, micro_contests_enabled FROM ipl_matches WHERE roanuz_key = $1', [transition.matchKey]);
            if (matchRes.rows.length === 0) return;
            const match = matchRes.rows[0];
            const matchId = match.id;

            // 2. Extract Outcome
            const outcome = BallByBallExtractor.parseOverOutcome(relatedBalls || []);
            
            // 3. Settle previous over contests
            if (transition.completedOver > 0) {
                await this.settleOverContests(
                    matchId, 
                    transition.completedOver, 
                    transition.completedInnings, 
                    outcome
                );
            }

            // 4. Close betting for the over that just STARTED (newOver)
            // It is no longer safe to accept bets.
            await this.closeOverContests(matchId, transition.newOver, transition.newInnings);

            // 5. Create new over contests for the NEXT over (newOver + 1)
            // Users will bet on newOver + 1 while newOver is being played.
            if (!transition.isInningsChange && match.micro_contests_enabled) {
                await this.createOverContests(
                    transition.matchKey,
                    matchId, 
                    transition.newOver + 1, 
                    transition.newInnings
                );
            }

        } catch (error: any) {
            LoggerService.error('[LiveContestEngine] Error handling transition', {
                matchKey: transition.matchKey,
                error: error?.message
            });
        }
    }

    /**
     * Creates new micro-contests and broadcasts to merchants.
     */
    private static async createOverContests(matchKey: string, matchId: string, over: number, inningsKey: string) {
        // Parse innings number from "a_1" -> 1, "b_1" -> 2
        const inningsParts = inningsKey.split('_');
        const inningsNumber = inningsParts.length === 2 && inningsParts[0] === 'b' ? 2 : 1;

        // Ensure we don't create duplicate contests (idempotency check by over/innings)
        const existingRes = await query(
            'SELECT id FROM live_micro_contests WHERE match_id = $1 AND over_number = $2 AND innings = $3',
            [matchId, over, inningsNumber]
        );
        if (existingRes.rows.length > 0) return;

        // 1. OVER_OUTCOME Contest
        const outcomeMarket = await this.createMicroMarket(
            matchId, 
            over, 
            inningsNumber, 
            'OVER_OUTCOME', 
            `Biggest Event in Over ${over} (Innings ${inningsNumber})`,
            ['wicket', 'six', 'four', 'extra', 'dot', 'normal']
        );

        // 2. OVER_RUNS Contest
        const runsMarket = await this.createMicroMarket(
            matchId, 
            over, 
            inningsNumber, 
            'OVER_RUNS', 
            `Runs in Over ${over} (Innings ${inningsNumber})`,
            ['0-4', '5-8', '9-12', '13+']
        );

        if (outcomeMarket && runsMarket) {
            LoggerService.info('[LiveContestEngine] Created micro-contests', { matchId, over, inningsNumber });
            
            // Emit to frontend
            emitMicroContestOpen(matchKey, {
                matchId,
                over,
                inningsNumber,
                markets: [outcomeMarket, runsMarket]
            });
        }
    }

    private static async createMicroMarket(
        matchId: string, 
        over: number, 
        innings: number, 
        contestType: string, 
        title: string,
        options: string[]
    ) {
        // Create generic target pools
        const initialPools: Record<string, number> = {};
        options.forEach(opt => initialPools[opt] = 0);

        const closureTime = Date.now() + (3 * 60 * 1000); // 3 mins default TTL
        const resolveTime = closureTime + (5 * 60 * 1000);

        try {
            // Insert into markets
            const marketRes = await query(
                `INSERT INTO markets 
                 (title, status, closure_timestamp, resolution_timestamp, source_of_truth, category, term, ipl_match_id, contest_type, pools, total_pool) 
                 VALUES ($1, 'OPEN', $2, $3, 'Roanuz Live', 'IPL Micro', 'Instant', $4, $5, $6, 0) RETURNING *`,
                [title, closureTime, resolveTime, matchId, contestType, JSON.stringify(initialPools)]
            );
            const newMarket = marketRes.rows[0];

            // Insert into live_micro_contests for tracking
            const microRes = await query(
                `INSERT INTO live_micro_contests 
                 (match_id, market_id, over_number, innings, contest_type, status, opened_at)
                 VALUES ($1, $2, $3, $4, $5, 'OPEN', NOW()) RETURNING *`,
                [matchId, newMarket.id, over, innings, contestType]
            );

            return {
                ...newMarket,
                micro_id: microRes.rows[0].id
            };
        } catch (error: any) {
            LoggerService.error(`[LiveContestEngine] Failed to create ${contestType}`, { matchId, error: error?.message });
            return null;
        }
    }

    /**
     * Closes the micro-contests for an over so no more bets can be placed.
     */
    private static async closeOverContests(matchId: string, over: number, inningsKey: string) {
        const inningsParts = inningsKey.split('_');
        const inningsNumber = inningsParts.length === 2 && inningsParts[0] === 'b' ? 2 : 1;

        // Mark live_micro_contests as CLOSED
        const res = await query(
            `UPDATE live_micro_contests 
             SET status = 'CLOSED', closed_at = NOW() 
             WHERE match_id = $1 AND over_number = $2 AND innings = $3 AND status = 'OPEN'
             RETURNING market_id`,
            [matchId, over, inningsNumber]
        );

        if (res.rows.length === 0) return;

        // Update markets table to reflect closure (forcing betting to stop immediately)
        const marketIds = res.rows.map(row => row.market_id);
        
        // Use exactly NOW() as closure timestamp to block any incoming wagers in wagerController
        await query(
            `UPDATE markets 
             SET closure_timestamp = EXTRACT(EPOCH FROM NOW()) * 1000 
             WHERE id = ANY($1::uuid[])`,
            [marketIds]
        );
        
        LoggerService.info(`[LiveContestEngine] Closed betting for over ${over}`, { matchId, marketIds });
    }

    /**
     * Settles the micro-contests for an over deterministically.
     */
    private static async settleOverContests(matchId: string, over: number, inningsKey: string, outcomeData: OverOutcome) {
        const inningsParts = inningsKey.split('_');
        const inningsNumber = inningsParts.length === 2 && inningsParts[0] === 'b' ? 2 : 1;

        // Fetch pending micro contests
        const res = await query(
            `SELECT lmc.*, m.title, m.pools
             FROM live_micro_contests lmc 
             JOIN markets m ON lmc.market_id = m.id 
             WHERE lmc.match_id = $1 AND lmc.over_number = $2 AND lmc.innings = $3 AND lmc.status = 'OPEN'`,
            [matchId, over, inningsNumber]
        );

        if (res.rows.length === 0) return;

        for (const contest of res.rows) {
            let winningOption = '';

            if (contest.contest_type === 'OVER_OUTCOME') {
                winningOption = outcomeData.biggest_event;
            } else if (contest.contest_type === 'OVER_RUNS') {
                winningOption = CricketSettlement.settleOverRuns(outcomeData.runs);
            }

            if (winningOption) {
                // Settle market core logic
                await settleMarket(contest.market_id, winningOption);

                // Update micro contests table
                await query(
                    `UPDATE live_micro_contests 
                     SET status = 'SETTLED', closed_at = NOW(), actual_outcome = $1 
                     WHERE id = $2`,
                    [JSON.stringify(outcomeData), contest.id]
                );

                LoggerService.info(`[LiveContestEngine] Settled ${contest.contest_type}`, {
                    marketId: contest.market_id,
                    winningOption
                });
                
                // Fetch the matchKey for emitting socket
                const matchRes = await query('SELECT roanuz_key FROM ipl_matches WHERE id = $1', [matchId]);
                const matchKey = matchRes.rows[0].roanuz_key;

                emitMicroContestSettled(matchKey, {
                    marketId: contest.market_id,
                    contestType: contest.contest_type,
                    over,
                    inningsNumber,
                    winningOption,
                    actualData: outcomeData
                });
            }
        }
    }
}
