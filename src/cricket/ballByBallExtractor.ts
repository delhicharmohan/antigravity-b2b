import { LoggerService } from '../services/loggerService';

/**
 * Extracts per-over data from Roanuz WebSocket match updates.
 * Detects over transitions using `play.live` data.
 *
 * Roanuz live structure:
 * play.live: { innings_key: "a_1", over: 5, ball: 3, batting_team_key: "rcb", ... }
 * play.related_balls: [ { over_number, ball_number, runs, wicket, ... } ]
 */
export class BallByBallExtractor {
    private static lastKnownState: Map<string, { inningsKey: string; over: number }> = new Map();

    /**
     * Process a match update and detect if a new over has started.
     * Uses play.live.innings_key + play.live.over to detect transitions.
     */
    static processUpdate(matchKey: string, data: any): OverTransitionEvent | null {
        const live = data?.play?.live;
        if (!live?.innings_key) return null;

        const currentInningsKey = live.innings_key;
        const currentOver = live.over ?? 0;

        const lastKnown = this.lastKnownState.get(matchKey);

        // First update for this match
        if (!lastKnown) {
            this.lastKnownState.set(matchKey, { inningsKey: currentInningsKey, over: currentOver });
            return null;
        }

        // Detect over or innings change
        const overChanged = currentOver !== lastKnown.over;
        const inningsChanged = currentInningsKey !== lastKnown.inningsKey;

        if (!overChanged && !inningsChanged) return null;

        // Over transition detected!
        const event: OverTransitionEvent = {
            matchKey,
            completedInnings: lastKnown.inningsKey,
            completedOver: lastKnown.over,
            newInnings: currentInningsKey,
            newOver: currentOver,
            isInningsChange: inningsChanged,
        };

        // Update tracking
        this.lastKnownState.set(matchKey, { inningsKey: currentInningsKey, over: currentOver });

        LoggerService.info('[BallByBallExtractor] Over transition detected', {
            matchKey,
            from: `${lastKnown.inningsKey}.${lastKnown.over}`,
            to: `${currentInningsKey}.${currentOver}`,
        });

        return event;
    }

    /**
     * Parse over outcome from related_balls in the match update.
     */
    static parseOverOutcome(relatedBalls: any[]): OverOutcome {
        const outcome: OverOutcome = {
            fours: 0,
            sixes: 0,
            wickets: 0,
            dots: 0,
            extras: 0,
            runs: 0,
            biggest_event: 'normal',
        };

        for (const ball of relatedBalls) {
            const runs = ball.runs?.total || ball.runs || 0;
            outcome.runs += runs;

            if (ball.four || runs === 4) outcome.fours++;
            if (ball.six || runs === 6) outcome.sixes++;
            if (ball.wicket) outcome.wickets++;
            if (runs === 0 && !ball.extras?.total) outcome.dots++;
            if (ball.extras?.total > 0) outcome.extras++;
        }

        // Determine biggest event (priority order)
        if (outcome.wickets > 0) outcome.biggest_event = 'wicket';
        else if (outcome.sixes > 0) outcome.biggest_event = 'six';
        else if (outcome.fours > 0) outcome.biggest_event = 'four';
        else if (outcome.extras > 0) outcome.biggest_event = 'extra';
        else if (outcome.dots >= 3) outcome.biggest_event = 'dot';
        else outcome.biggest_event = 'normal';

        return outcome;
    }

    /**
     * Check if a match is currently in a state where micro-contests are viable.
     */
    static isMatchActive(data: any): boolean {
        if (data.status !== 'started') return false;
        if (data.play_status === 'innings_break') return false;
        if (data.play_status === 'result') return false;
        return true;
    }

    /**
     * Reset tracking for a match (e.g., when match completes).
     */
    static resetMatch(matchKey: string): void {
        this.lastKnownState.delete(matchKey);
    }
}

export interface OverTransitionEvent {
    matchKey: string;
    completedInnings: string;  // e.g., "a_1"
    completedOver: number;
    newInnings: string;        // e.g., "a_1" or "b_1"
    newOver: number;
    isInningsChange: boolean;
}

export interface OverOutcome {
    fours: number;
    sixes: number;
    wickets: number;
    dots: number;
    extras: number;
    runs: number;
    biggest_event: string;
}
