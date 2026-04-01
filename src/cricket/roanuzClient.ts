import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { LoggerService } from '../services/loggerService';
import {
    RoanuzAuthResponse,
    RoanuzMatchData,
    RoanuzFixture,
    RoanuzOverSummary,
} from './types';

const ROANUZ_BASE = 'https://api.sports.roanuz.com/v5/cricket';
const ROANUZ_AUTH_BASE = 'https://api.sports.roanuz.com/v5/core';

export class RoanuzClient {
    private projectKey: string;
    private apiKey: string;
    private token: string | null = null;
    private tokenExpiry: number = 0;
    private http: AxiosInstance;
    private etagCache: Map<string, { etag: string; data: any }> = new Map();

    constructor() {
        this.projectKey = process.env.ROANUZ_PROJECT_KEY || '';
        this.apiKey = process.env.ROANUZ_API_KEY || '';

        if (!this.projectKey) {
            LoggerService.warn('[RoanuzClient] ROANUZ_PROJECT_KEY not set');
        }

        this.http = axios.create({
            baseURL: `${ROANUZ_BASE}/${this.projectKey}`,
            timeout: 15000,
        });

        this.http.interceptors.response.use(
            (response) => this.handleEtagResponse(response),
            (error) => this.handleError(error)
        );
    }

    // ===== Authentication =====

    async authenticate(): Promise<string> {
        if (this.token && Date.now() < this.tokenExpiry - 60_000) {
            return this.token;
        }

        try {
            const response = await axios.post<RoanuzAuthResponse>(
                `${ROANUZ_AUTH_BASE}/${this.projectKey}/auth/`,
                { api_key: this.apiKey }
            );

            this.token = response.data.data.token;
            this.tokenExpiry = response.data.data.expires * 1000;

            await LoggerService.info('[RoanuzClient] Authenticated successfully', {
                expiresAt: new Date(this.tokenExpiry).toISOString(),
            });

            return this.token;
        } catch (error: any) {
            await LoggerService.error('[RoanuzClient] Authentication failed', {
                status: error?.response?.status,
                message: error?.message,
            });
            throw new Error('Roanuz authentication failed');
        }
    }

    private async getHeaders(): Promise<Record<string, string>> {
        const token = await this.authenticate();
        return { 'rs-token': token };
    }

    // ===== ETag Caching =====

    private handleEtagResponse(response: AxiosResponse): AxiosResponse {
        const etag = response.headers['etag'];
        if (etag && response.config.url) {
            this.etagCache.set(response.config.url, {
                etag,
                data: response.data,
            });
        }
        return response;
    }

    private handleError(error: any): never {
        // On 304 Not Modified, we handle it in the request() method via catch
        // On 401, clear token
        if (error?.response?.status === 401) {
            this.token = null;
            this.tokenExpiry = 0;
        }

        throw error;
    }

    private async request<T>(url: string, retries = 2): Promise<T> {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const headers: Record<string, string> = await this.getHeaders();

                const cached = this.etagCache.get(url);
                if (cached) {
                    headers['If-None-Match'] = cached.etag;
                }

                const response = await this.http.get<T>(url, { headers });
                return response.data;
            } catch (error: any) {
                const status = error?.response?.status;

                // Return cached data on 304
                if (status === 304) {
                    const cached = this.etagCache.get(url);
                    if (cached) return cached.data as T;
                }

                // Retry on 429 (rate limit) or 5xx
                if (attempt < retries && (status === 429 || status >= 500)) {
                    const delay = Math.pow(2, attempt) * 1000;
                    await LoggerService.warn(`[RoanuzClient] Retry ${attempt + 1} for ${url}`, {
                        status,
                        delay,
                    });
                    await new Promise((r) => setTimeout(r, delay));
                    continue;
                }

                throw error;
            }
        }

        throw new Error(`[RoanuzClient] All retries exhausted for ${url}`);
    }

    // ===== Tournament Endpoints =====

    async getFeaturedTournaments(): Promise<any> {
        return this.request('/featured-tournaments/');
    }

    async getTournament(tournamentKey: string): Promise<any> {
        return this.request(`/tournament/${tournamentKey}/`);
    }

    async getTournamentFixtures(tournamentKey: string, page?: number): Promise<any> {
        const pagePath = page ? `${page}/` : '';
        return this.request(`/tournament/${tournamentKey}/fixtures/${pagePath}`);
    }

    async getTournamentStats(tournamentKey: string): Promise<any> {
        return this.request(`/tournament/${tournamentKey}/stats/`);
    }

    async getTournamentPlayerStats(tournamentKey: string, playerKey: string): Promise<any> {
        return this.request(`/tournament/${tournamentKey}/player-stats/${playerKey}/`);
    }

    async getTournamentTeam(tournamentKey: string, teamKey: string): Promise<any> {
        return this.request(`/tournament/${tournamentKey}/team/${teamKey}/`);
    }

    // ===== Match Endpoints =====

    async getMatch(matchKey: string): Promise<RoanuzMatchData> {
        return this.request<RoanuzMatchData>(`/match/${matchKey}/`);
    }

    async getBallByBall(matchKey: string, overKey?: string): Promise<any> {
        const overPath = overKey ? `${overKey}/` : '';
        return this.request(`/match/${matchKey}/ball-by-ball/${overPath}`);
    }

    async getFirstOver(matchKey: string): Promise<any> {
        return this.request(`/match/${matchKey}/ball-by-ball/FIRST-OVER/`);
    }

    async getOverSummary(matchKey: string, overKey?: string): Promise<any> {
        const overPath = overKey ? `${overKey}/` : '';
        return this.request(`/match/${matchKey}/over-summary/${overPath}`);
    }

    async getFantasyCredits(matchKey: string): Promise<any> {
        return this.request(`/match/${matchKey}/fantasy-credits/`);
    }

    async getFantasyPoints(matchKey: string): Promise<any> {
        return this.request(`/match/${matchKey}/fantasy-points/`);
    }

    // ===== Match Subscribe (for WebSocket) =====

    async subscribeMatch(matchKey: string): Promise<any> {
        const headers = await this.getHeaders();
        const response = await this.http.post(
            `/match/${matchKey}/subscribe/`,
            { method: 'web_socket' },
            { headers }
        );
        await LoggerService.info('[RoanuzClient] Subscribed to match WebSocket', { matchKey });
        return response.data;
    }

    async unsubscribeMatch(matchKey: string): Promise<void> {
        try {
            const headers = await this.getHeaders();
            await this.http.post(
                `/match/${matchKey}/unsubscribe/`,
                {},
                { headers }
            );
            await LoggerService.info('[RoanuzClient] Unsubscribed from match', { matchKey });
        } catch (error: any) {
            await LoggerService.warn('[RoanuzClient] Unsubscribe failed (non-critical)', {
                matchKey,
                message: error?.message,
            });
        }
    }

    // ===== Utility =====

    getProjectKey(): string {
        return this.projectKey;
    }

    isConfigured(): boolean {
        return !!(this.projectKey && this.apiKey);
    }
}

// Singleton instance
export const roanuzClient = new RoanuzClient();
