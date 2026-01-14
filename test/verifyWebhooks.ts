import axios from 'axios';
import crypto from 'crypto';

/**
 * Verification Script for Webhooks and IP Whitelisting
 */
async function verify() {
    const API_KEY = 'troy_secret';
    const BASE_URL = 'http://localhost:3001/v1';
    const ADMIN_URL = 'http://localhost:3001/admin';

    try {
        console.log('--- 0. System Check ---');
        const res = await axios.get(`${ADMIN_URL}/merchants`);
        const merchants = res.data;
        console.log('Found merchants:', merchants.length);
        const troy = merchants.find((m: any) => m.config?.name === 'Troy');
        if (troy) {
            console.log('Troy found:', { id: troy.id, hash: troy.api_key_hash, config: troy.config });
        } else {
            console.log('Troy NOT found in the list!');
        }
    } catch (e: any) {
        console.log('❌ Admin API check failed:', e.message);
    }

    console.log('\n--- 1. Testing IP Whitelisting ---');
    try {
        console.log('Testing signed request as Troy...');
        const body = { market_id: '00000000-0000-0000-0000-000000000001', selection: 'yes', stake: 100 };
        const bodyStr = JSON.stringify(body);
        const signature = crypto.createHmac('sha256', API_KEY).update(bodyStr).digest('hex');

        const res = await axios.post(`${BASE_URL}/wager`, body, {
            headers: {
                'X-Merchant-API-Key': API_KEY,
                'X-Merchant-Signature': signature
            }
        });
        console.log('✅ Request success:', res.status);
    } catch (e: any) {
        console.log('❌ Request failed:', e.response?.data || e.message);
    }

    console.log('\n--- 2. To Verify Webhooks ---');
    console.log('1. Go to Merchant Manager in UI.');
    console.log('2. Set Webhook URL to a RequestBin or local listener.');
    console.log('3. Settle a market manually or wait for Oracle.');
    console.log('4. Verify X-Antigravity-Signature header is present and valid.');
}

verify();
