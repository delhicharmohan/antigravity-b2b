import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

if (!process.env.DATABASE_URL &&
    (!process.env.POSTGRES_USER || !process.env.POSTGRES_HOST || !process.env.POSTGRES_DB || !process.env.POSTGRES_PASSWORD)) {
    throw new Error('Database configuration missing. Either DATABASE_URL or all individual POSTGRES_* variables must be provided.');
}

const poolConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        user: process.env.POSTGRES_USER,
        host: process.env.POSTGRES_HOST,
        database: process.env.POSTGRES_DB,
        password: process.env.POSTGRES_PASSWORD,
        port: Number(process.env.POSTGRES_PORT) || 5433,
    };

const pool = new Pool(poolConfig);

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err)
    process.exit(-1)
})

export const query = (text: string, params?: any[]) => pool.query(text, params);
export const getClient = () => pool.connect();
