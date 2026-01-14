import { getClient } from './config/db';
import fs from 'fs';
import path from 'path';

async function setup() {
    console.log('Starting Database Setup...');
    const client = await getClient();
    try {
        const sqlPath = path.join(__dirname, '../init.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Executing init.sql...');
        await client.query(sql);
        console.log('Database Setup Complete!');
    } catch (err) {
        console.error('Error during database setup:', err);
    } finally {
        client.release();
        process.exit(0);
    }
}

setup();
