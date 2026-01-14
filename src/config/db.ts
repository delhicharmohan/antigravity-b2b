import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const poolConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        user: process.env.POSTGRES_USER || 'antigravity',
        host: process.env.POSTGRES_HOST || 'localhost',
        database: process.env.POSTGRES_DB || 'antigravity_b2b',
        password: process.env.POSTGRES_PASSWORD || 'password123',
        port: Number(process.env.POSTGRES_PORT) || 5433,
    };

const pool = new Pool(poolConfig);

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err)
    process.exit(-1)
})

export const query = (text: string, params?: any[]) => pool.query(text, params);
export const getClient = () => pool.connect();
