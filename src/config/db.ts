import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const getPoolConfig = () => {
    if (process.env.DATABASE_URL) {
        return { connectionString: process.env.DATABASE_URL };
    }

    const {
        POSTGRES_USER,
        POSTGRES_HOST,
        POSTGRES_DB,
        POSTGRES_PASSWORD,
        POSTGRES_PORT
    } = process.env;

    if (!POSTGRES_USER || !POSTGRES_HOST || !POSTGRES_DB || !POSTGRES_PASSWORD) {
        throw new Error(
            'Database configuration error: DATABASE_URL or (POSTGRES_USER, POSTGRES_HOST, POSTGRES_DB, POSTGRES_PASSWORD) must be provided.'
        );
    }

    return {
        user: POSTGRES_USER,
        host: POSTGRES_HOST,
        database: POSTGRES_DB,
        password: POSTGRES_PASSWORD,
        port: Number(POSTGRES_PORT) || 5433,
    };
};

const poolConfig = getPoolConfig();

const pool = new Pool(poolConfig);

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err)
    process.exit(-1)
})

export const query = (text: string, params?: any[]) => pool.query(text, params);
export const getClient = () => pool.connect();
