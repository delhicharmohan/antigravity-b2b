import { query, getClient } from '../src/config/db';
import assert from 'assert';

async function verifyDB() {
    console.log('Verifying DB Connection...');
    try {
        const res = await query('SELECT NOW()');
        console.log('DB Connection Check: PASSED', res.rows[0]);
    } catch (e) {
        console.error('DB Connection Check: FAILED', e);
        process.exit(1);
    }
}

async function verifySchema() {
    console.log('Verifying Schema...');
    try {
        const res = await query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
        const tables = res.rows.map(r => r.table_name);
        assert.ok(tables.includes('merchants'), 'Merchants table missing');
        assert.ok(tables.includes('markets'), 'Markets table missing');
        assert.ok(tables.includes('wagers'), 'Wagers table missing');
        console.log('Schema Check: PASSED');
    } catch (e) {
        console.error('Schema Check: FAILED', e);
        process.exit(1);
    }
}

async function run() {
    await verifyDB();
    await verifySchema();
    process.exit(0);
}

run();
