import { query, getClient } from '../config/db';
import { LoggerService } from '../services/loggerService';
import { ContestType, MarketTemplate } from './types';
import { TournamentSyncService } from './tournamentSyncService';
import crypto from 'crypto';

const SYSTEM_MERCHANT_UUID = '00000000-0000-0000-0000-000000000001'; // Fixed UUID for system liquidity
const SYSTEM_MERCHANT_HASH = 'system_ipl_liquidity_v1'; // Unique hash for system account
const INITIAL_LIQUIDITY = 500; // Base liquidity per market

export class IPLMarketGenerator {

    /**
     * Generate pre-match contests for all today's unprocessed matches.
     */
    static async generateTodaysMarkets(): Promise<number> {
        const matches = await TournamentSyncService.getTodaysUnprocessedMatches();
        let totalGenerated = 0;

        for (const match of matches) {
            try {
                const count = await this.generateMarketsForMatch(match);
                totalGenerated += count;
            } catch (error: any) {
                await LoggerService.error('[IPLMarketGen] Failed to generate markets for match', {
                    matchId: match.id,
                    roanuzKey: match.roanuz_key,
                    message: error?.message,
                });
            }
        }

        await LoggerService.info('[IPLMarketGen] Daily generation complete', {
            matchesProcessed: matches.length,
            totalMarkets: totalGenerated,
        });

        return totalGenerated;
    }

    /**
     * Generate all pre-match contest templates for a single match.
     */
    static async generateMarketsForMatch(match: any): Promise<number> {
        const teamA = typeof match.team_a === 'string' ? JSON.parse(match.team_a) : match.team_a;
        const teamB = typeof match.team_b === 'string' ? JSON.parse(match.team_b) : match.team_b;
        const contestGroupId = crypto.randomUUID();
        let count = 0;

        const templates = this.buildTemplates(match, teamA, teamB);

        // Closure: 30 min before match start
        const matchStartMs = new Date(match.start_time).getTime();
        const closureTimestamp = matchStartMs - 30 * 60 * 1000;
        // Resolution: 6 hours after match start (T20 typically finishes in ~3.5h)
        const resolutionTimestamp = matchStartMs + 6 * 60 * 60 * 1000;

        for (const template of templates) {
            try {
                await this.createMarket(
                    match.id,
                    contestGroupId,
                    template,
                    closureTimestamp,
                    resolutionTimestamp
                );
                count++;
            } catch (error: any) {
                await LoggerService.error('[IPLMarketGen] Failed to create market', {
                    matchId: match.id,
                    title: template.title,
                    message: error?.message,
                });
            }
        }

        // Mark match as processed
        await query(
            `UPDATE ipl_matches SET prematch_markets_generated = TRUE, contest_group_id = $1 WHERE id = $2`,
            [contestGroupId, match.id]
        );

        await LoggerService.info('[IPLMarketGen] Markets generated for match', {
            matchId: match.id,
            teams: `${teamA.short_name} vs ${teamB.short_name}`,
            count,
        });

        return count;
    }

    /**
     * Build market templates based on match data.
     */
    private static buildTemplates(match: any, teamA: any, teamB: any): MarketTemplate[] {
        const vs = `${teamA.short_name} vs ${teamB.short_name}`;
        const templates: MarketTemplate[] = [];

        // 1. Match Winner
        templates.push({
            title: `Who will win: ${vs}?`,
            contestType: 'MATCH_WINNER',
            sourceOfTruth: 'Roanuz Match API - Final Result',
            options: [teamA.short_name, teamB.short_name],
            settlementParams: { teamA_key: teamA.key, teamB_key: teamB.key },
        });

        // 2. Total Sixes
        templates.push({
            title: `Will there be 12+ sixes in ${vs}?`,
            contestType: 'TOTAL_SIXES',
            sourceOfTruth: 'Roanuz Match API - Match Stats',
            options: ['Yes', 'No'],
            settlementParams: { threshold: 12 },
        });

        // 3. Runs Bracket
        templates.push({
            title: `Total runs in ${vs}: Over or Under 330?`,
            contestType: 'RUNS_BRACKET',
            sourceOfTruth: 'Roanuz Match API - Final Score',
            options: ['Over 330', 'Under 330'],
            settlementParams: { threshold: 330 },
        });

        // 4. First innings score bracket
        templates.push({
            title: `First innings score in ${vs}: Over or Under 170?`,
            contestType: 'RUNS_BRACKET',
            sourceOfTruth: 'Roanuz Match API - Innings Score',
            options: ['Over 170', 'Under 170'],
            settlementParams: { threshold: 170, innings: 1 },
        });

        return templates;
    }

    /**
     * Create a single market in the database (reuses existing markets table).
     */
    private static async createMarket(
        matchId: string,
        contestGroupId: string,
        template: MarketTemplate,
        closureTimestamp: number,
        resolutionTimestamp: number
    ): Promise<string> {
        const client = await getClient();

        try {
            await client.query('BEGIN');

            // Ensure System Liquidity merchant exists (uses a fixed UUID so it's always idempotent)
            await client.query(
                `INSERT INTO merchants (id, api_key_hash, raw_api_key, config)
                 VALUES ($1, $2, 'system_ipl_key', '{"name": "System Liquidity (IPL)"}')
                 ON CONFLICT (id) DO NOTHING`,
                [SYSTEM_MERCHANT_UUID, SYSTEM_MERCHANT_HASH]
            );

            const halfLiquidity = Math.floor(INITIAL_LIQUIDITY / 2);

            // Create market
            const marketResult = await client.query(
                `INSERT INTO markets (title, status, closure_timestamp, resolution_timestamp, source_of_truth,
                    category, term, pool_yes, pool_no, confidence_score, ipl_match_id, contest_type)
                 VALUES ($1, 'OPEN', $2, $3, $4, 'IPL', 'Ultra Short', $5, $6, 0.90, $7, $8)
                 RETURNING id`,
                [
                    template.title,
                    closureTimestamp,
                    resolutionTimestamp,
                    template.sourceOfTruth,
                    halfLiquidity,
                    halfLiquidity,
                    matchId,
                    template.contestType,
                ]
            );

            const marketId = marketResult.rows[0].id;

            // Create system liquidity wagers for audit trail
            await client.query(
                `INSERT INTO wagers (merchant_id, market_id, selection, stake, external_user_id)
                 VALUES ($1, $2, 'yes', $3, 'SYSTEM'),
                        ($1, $2, 'no', $3, 'SYSTEM')`,
                [SYSTEM_MERCHANT_UUID, marketId, halfLiquidity]
            );

            await client.query('COMMIT');

            return marketId;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}
