import { query } from '../src/config/db';
import crypto from 'crypto';

async function fix() {
    const key = 'system_liquidity_key';
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    console.log(`Fixing system_liquidity hash to: ${hash}`);
    await query("UPDATE merchants SET api_key_hash = $1 WHERE raw_api_key = $2", [hash, key]);
    console.log('Fixed.');
}
fix();
