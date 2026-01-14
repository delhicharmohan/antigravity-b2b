import { query } from '../config/db';

export enum LogLevel {
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR'
}

export class LoggerService {
    public static async log(level: LogLevel, message: string, details: any = {}) {
        try {
            // Log to console for dev visibility
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] [${level}] ${message}`);

            // Persist to database
            await query(
                'INSERT INTO system_logs (level, message, details) VALUES ($1, $2, $3)',
                [level, message, JSON.stringify(details)]
            );
        } catch (error) {
            console.error('[LoggerService] Failed to persist log:', error);
        }
    }

    public static async info(message: string, details: any = {}) {
        await this.log(LogLevel.INFO, message, details);
    }

    public static async warn(message: string, details: any = {}) {
        await this.log(LogLevel.WARN, message, details);
    }

    public static async error(message: string, details: any = {}) {
        await this.log(LogLevel.ERROR, message, details);
    }

    public static async listLogs(limit: number = 100) {
        const result = await query(
            'SELECT * FROM system_logs ORDER BY created_at DESC LIMIT $1',
            [limit]
        );
        return result.rows;
    }
}
