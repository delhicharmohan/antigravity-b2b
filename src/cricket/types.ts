// ===== Roanuz API Response Types =====

export interface RoanuzAuthResponse {
    data: {
        token: string;
        expires: number;
    };
}

export interface RoanuzTeam {
    key: string;
    name: string;
    short_name: string;
    logo_url?: string;
}

export interface RoanuzPlayer {
    key: string;
    name: string;
    jersey_number?: string;
    role?: string;
    batting_style?: string;
    bowling_style?: string;
}

export interface RoanuzFixture {
    key: string;
    name?: string;
    short_name?: string;
    status: string;
    start_at: number; // unix timestamp
    teams: {
        a: RoanuzTeam;
        b: RoanuzTeam;
    };
    venue?: {
        name: string;
        city?: string;
        country?: string;
    };
    format?: string;
    toss?: {
        winner: string;
        decision: string;
    };
}

export interface RoanuzInningsScore {
    batting_team_key: string;
    score: number;
    wickets: number;
    overs: number;
    run_rate: number;
}

export interface RoanuzBatsman {
    name: string;
    player_key: string;
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    strike_rate: number;
    out?: boolean;
}

export interface RoanuzBowler {
    name: string;
    player_key: string;
    overs: number;
    maidens: number;
    runs: number;
    wickets: number;
    economy: number;
}

export interface RoanuzBall {
    ball_number: number;
    over_number: number;
    innings: number;
    runs: number;
    is_four: boolean;
    is_six: boolean;
    is_wicket: boolean;
    is_dot: boolean;
    is_extra: boolean;
    extra_type?: string;
    commentary?: string;
}

export interface RoanuzOverSummary {
    over_number: number;
    innings: number;
    runs: number;
    wickets: number;
    balls: RoanuzBall[];
}

export interface RoanuzMatchData {
    key: string;
    status: string;           // 'not_started' | 'started' | 'completed' | 'abandoned'
    play_status?: string;     // 'in_play' | 'innings_break' | 'result'
    teams: {
        a: RoanuzTeam;
        b: RoanuzTeam;
    };
    innings: RoanuzInningsScore[];
    batsmen?: RoanuzBatsman[];
    bowlers?: RoanuzBowler[];
    last_ball?: RoanuzBall;
    toss?: {
        winner: string;
        decision: string;
    };
    result?: string;
    winning_team_key?: string;
    match_odds?: {
        team_a: number;
        team_b: number;
        draw?: number;
    };
}

// ===== Internal Domain Types =====

export interface IPLTournament {
    id: string;
    roanuz_key: string;
    name: string;
    season?: string;
    status: 'UPCOMING' | 'LIVE' | 'COMPLETED';
    start_date?: Date;
    end_date?: Date;
    teams?: RoanuzTeam[];
    synced_at?: Date;
}

export interface IPLMatch {
    id: string;
    tournament_id: string;
    roanuz_key: string;
    match_number?: number;
    team_a: RoanuzTeam;
    team_b: RoanuzTeam;
    venue?: string;
    start_time: Date;
    status: 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'ABANDONED';
    toss?: { winner: string; decision: string };
    score?: RoanuzInningsScore[];
    result?: string;
    match_odds?: { team_a: number; team_b: number; draw?: number };
    prematch_markets_generated: boolean;
    contest_group_id?: string;
    synced_at?: Date;
}

export interface IPLPlayer {
    id: string;
    roanuz_key: string;
    name: string;
    team_key?: string;
    role?: string;
    batting_style?: string;
    bowling_style?: string;
    stats?: Record<string, any>;
    synced_at?: Date;
}

export type ContestType =
    | 'MATCH_WINNER'
    | 'TOP_SCORER'
    | 'PLAYER_RUNS'
    | 'PLAYER_WICKETS'
    | 'TOTAL_SIXES'
    | 'RUNS_BRACKET'
    | 'OVER_OUTCOME'
    | 'OVER_RUNS'
    | 'BALL_PREDICTION';

export type MicroContestStatus = 'PENDING' | 'OPEN' | 'CLOSED' | 'SETTLED';

export interface LiveMicroContest {
    id: string;
    match_id: string;
    market_id: string;
    over_number: number;
    innings: number;
    contest_type: ContestType;
    status: MicroContestStatus;
    opened_at?: Date;
    closed_at?: Date;
    actual_outcome?: OverOutcome;
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

// ===== Scorecard Broadcast Payloads =====

export interface ScorecardUpdate {
    matchKey: string;
    status: 'LIVE' | 'INNINGS_BREAK' | 'COMPLETED' | 'ABANDONED';
    innings: InningsDisplay[];
    lastBall?: {
        runs: number;
        type: string;
        commentary: string;
    };
    matchOdds?: {
        teamA: number;
        teamB: number;
        draw?: number;
    };
    recentOvers: { overNum: number; runs: number; wickets: number }[];
}

export interface InningsDisplay {
    team: { key: string; name: string; shortName: string };
    score: number;
    wickets: number;
    overs: number;
    runRate: number;
    batsmen: BatsmanDisplay[];
    bowler?: BowlerDisplay;
}

export interface BatsmanDisplay {
    name: string;
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    strikeRate: number;
}

export interface BowlerDisplay {
    name: string;
    overs: number;
    maidens: number;
    runs: number;
    wickets: number;
    economy: number;
}

// ===== Pre-Match Market Templates =====

export interface MarketTemplate {
    title: string;
    contestType: ContestType;
    sourceOfTruth: string;
    options: string[];        // For N-way: ['CSK', 'MI'] or ['Wicket', 'Six', 'Four', ...]
    settlementParams: Record<string, any>; // e.g. { playerKey: 'virat_kohli', threshold: 30 }
}

// ===== WebSocket Subscription =====

export interface MatchSubscription {
    matchKey: string;
    subscribedAt: Date;
    lastUpdateAt?: Date;
    status: 'ACTIVE' | 'DISCONNECTED' | 'UNSUBSCRIBED';
}
