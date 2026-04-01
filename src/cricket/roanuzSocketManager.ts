import { io as ioClient, Socket } from 'socket.io-client';
import { roanuzClient } from './roanuzClient';
import { LoggerService } from '../services/loggerService';
import { MatchSubscription, RoanuzMatchData } from './types';
import zlib from 'zlib';

const ROANUZ_WS_URL = 'http://socket.sports.roanuz.com/cricket';
const ROANUZ_WS_PATH = '/v5/websocket';
const MAX_CONNECTIONS = 18; // Roanuz limit ~20, keep 2 buffer

type MatchUpdateCallback = (matchKey: string, data: any) => void;

export class RoanuzSocketManager {
    private socket: Socket | null = null;
    private subscriptions: Map<string, MatchSubscription> = new Map();
    private updateCallbacks: MatchUpdateCallback[] = [];
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private isConnected = false;

    // ===== Connection Lifecycle =====

    connect(): void {
        if (this.socket?.connected) return;

        this.socket = ioClient(ROANUZ_WS_URL, {
            path: ROANUZ_WS_PATH,
            reconnection: true,
            reconnectionAttempts: this.maxReconnectAttempts,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 30000,
            transports: ['websocket', 'polling'],
        });

        this.socket.on('connect', () => {
            this.isConnected = true;
            this.reconnectAttempts = 0;
            LoggerService.info('[RoanuzSocket] Connected to Roanuz WebSocket server');

            // Re-join all active match rooms on reconnect
            for (const [matchKey, sub] of this.subscriptions.entries()) {
                if (sub.status === 'ACTIVE' || sub.status === 'DISCONNECTED') {
                    this.joinMatchRoom(matchKey);
                }
            }
        });

        this.socket.on('disconnect', (reason: string) => {
            this.isConnected = false;
            LoggerService.warn('[RoanuzSocket] Disconnected', { reason });

            for (const [key, sub] of this.subscriptions.entries()) {
                if (sub.status === 'ACTIVE') {
                    sub.status = 'DISCONNECTED';
                    this.subscriptions.set(key, sub);
                }
            }
        });

        this.socket.on('connect_error', (error: Error) => {
            this.reconnectAttempts++;
            LoggerService.error('[RoanuzSocket] Connection error', {
                message: error.message,
                attempt: this.reconnectAttempts,
            });
        });

        // ===== Roanuz-specific events =====

        // Match joined confirmation
        this.socket.on('on_match_joined', (data: any) => {
            LoggerService.info('[RoanuzSocket] Match room joined', {
                key: data?.key || 'unknown',
            });
        });

        // Live match updates (may be gzipped JSON string)
        this.socket.on('on_match_update', (rawData: any) => {
            this.handleMatchUpdate(rawData);
        });

        // Error from Roanuz
        this.socket.on('on_error', (data: any) => {
            let parsed = data;
            try {
                if (typeof data === 'string') parsed = JSON.parse(data);
            } catch { /* ignore parse errors */ }

            LoggerService.error('[RoanuzSocket] Server error event', { data: parsed });
        });

        LoggerService.info('[RoanuzSocket] Initiating connection to Roanuz WebSocket');
    }

    disconnect(): void {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
            this.subscriptions.clear();
            LoggerService.info('[RoanuzSocket] Disconnected and cleaned up');
        }
    }

    // ===== Match Subscription =====

    /**
     * Two-step subscribe:
     * 1. REST: POST /match/{key}/subscribe/ with { method: "web_socket" }
     * 2. WS: emit('connect_to_match', { token, match_key })
     */
    async subscribeMatch(matchKey: string): Promise<boolean> {
        if (this.subscriptions.size >= MAX_CONNECTIONS) {
            await LoggerService.warn('[RoanuzSocket] Connection limit reached', {
                matchKey,
                active: this.subscriptions.size,
                limit: MAX_CONNECTIONS,
            });
            return false;
        }

        if (this.subscriptions.has(matchKey)) {
            return true;
        }

        try {
            // Step 1: REST subscribe
            await roanuzClient.subscribeMatch(matchKey);

            // Step 2: Ensure WS connected, then join room
            if (!this.socket?.connected) {
                this.connect();
            }

            this.subscriptions.set(matchKey, {
                matchKey,
                subscribedAt: new Date(),
                status: 'ACTIVE',
            });

            // Step 3: Join the match room via socket emit
            this.joinMatchRoom(matchKey);

            await LoggerService.info('[RoanuzSocket] Match subscribed', {
                matchKey,
                totalActive: this.subscriptions.size,
            });

            return true;
        } catch (error: any) {
            await LoggerService.error('[RoanuzSocket] Subscribe failed', {
                matchKey,
                message: error?.message,
            });
            return false;
        }
    }

    async unsubscribeMatch(matchKey: string): Promise<void> {
        try {
            await roanuzClient.unsubscribeMatch(matchKey);
        } catch {
            // Non-critical
        }

        this.subscriptions.delete(matchKey);

        await LoggerService.info('[RoanuzSocket] Match unsubscribed', {
            matchKey,
            totalActive: this.subscriptions.size,
        });

        if (this.subscriptions.size === 0 && this.socket?.connected) {
            this.disconnect();
        }
    }

    /**
     * Join a match room via socket emit.
     * Protocol: socket.emit('connect_to_match', { token, match_key })
     */
    private async joinMatchRoom(matchKey: string): Promise<void> {
        if (!this.socket?.connected) return;

        try {
            const token = await roanuzClient.authenticate();
            this.socket.emit('connect_to_match', {
                token,
                match_key: matchKey,
            });

            const sub = this.subscriptions.get(matchKey);
            if (sub) {
                sub.status = 'ACTIVE';
                this.subscriptions.set(matchKey, sub);
            }

            LoggerService.info('[RoanuzSocket] Emitted connect_to_match', { matchKey });
        } catch (error: any) {
            LoggerService.error('[RoanuzSocket] joinMatchRoom failed', {
                matchKey,
                message: error?.message,
            });
        }
    }

    // ===== Event Handling =====

    onMatchUpdate(callback: MatchUpdateCallback): void {
        this.updateCallbacks.push(callback);
    }

    /**
     * Handle raw data from 'on_match_update' event.
     * Data may be a gzipped JSON string that needs parsing.
     */
    private handleMatchUpdate(rawData: any): void {
        try {
            let matchData: any;

            if (typeof rawData === 'string') {
                // Try JSON parse first (may be plain JSON string)
                try {
                    matchData = JSON.parse(rawData);
                } catch {
                    // Might be gzipped — try decompressing
                    const buffer = Buffer.from(rawData, 'base64');
                    const decompressed = zlib.gunzipSync(buffer);
                    matchData = JSON.parse(decompressed.toString());
                }
            } else if (Buffer.isBuffer(rawData)) {
                // Raw buffer — try decompressing
                try {
                    const decompressed = zlib.gunzipSync(rawData);
                    matchData = JSON.parse(decompressed.toString());
                } catch {
                    matchData = rawData;
                }
            } else {
                matchData = rawData;
            }

            // Extract from Roanuz wrapper: { data: { key, status, play, ... } }
            const data = matchData?.data || matchData;
            const matchKey = data?.key;

            if (!matchKey) {
                LoggerService.warn('[RoanuzSocket] Update missing match key', {
                    keys: typeof data === 'object' ? Object.keys(data).slice(0, 10) : typeof data,
                });
                return;
            }

            // Update last-seen timestamp
            const sub = this.subscriptions.get(matchKey);
            if (sub) {
                sub.lastUpdateAt = new Date();
                this.subscriptions.set(matchKey, sub);
            }

            // Forward to all callbacks
            for (const callback of this.updateCallbacks) {
                try {
                    callback(matchKey, data);
                } catch (err: any) {
                    LoggerService.error('[RoanuzSocket] Callback error', {
                        matchKey,
                        error: err?.message,
                    });
                }
            }
        } catch (error: any) {
            LoggerService.error('[RoanuzSocket] Update parse error', {
                error: error?.message,
                dataType: typeof rawData,
            });
        }
    }

    // ===== Status Queries =====

    getActiveSubscriptions(): string[] {
        return Array.from(this.subscriptions.entries())
            .filter(([_, sub]) => sub.status === 'ACTIVE')
            .map(([key]) => key);
    }

    getSubscriptionCount(): number {
        return this.subscriptions.size;
    }

    isSocketConnected(): boolean {
        return this.isConnected;
    }

    getSubscriptionStatus(matchKey: string): MatchSubscription | undefined {
        return this.subscriptions.get(matchKey);
    }
}

// Singleton
export const roanuzSocketManager = new RoanuzSocketManager();
