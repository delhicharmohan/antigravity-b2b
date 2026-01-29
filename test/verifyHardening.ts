import axios from 'axios';
import crypto from 'crypto';

const BASE_URL = 'http://localhost:3000/v1';
const API_KEY = 'troy_secret';

function generateSignature(body: any, key: string): string {
    const bodyStr = JSON.stringify(body);
    return crypto
        .createHmac('sha256', key)
        .update(bodyStr)
        .digest('hex');
}

async function runTests() {
    console.log('--- Starting Security Hardening Verification ---');

    // Valid OPEN market from DB
    let marketId = '44346558-4149-4d3b-9c4a-f2790857c528';

    // 1. Test Liquidity Guard (Bet exceeding 50% of pool)
    // Pool is ~1800. 50% is ~900. Let's try 1500.
    try {
        console.log('\n[Test 1] Testing Liquidity Guard (Bet > 50% of pool)...');
        const body = {
            marketId,
            selection: 'yes',
            stake: 1500,
            userId: 'tester'
        };
        const signature = generateSignature(body, API_KEY);

        await axios.post(`${BASE_URL}/wager`, body, {
            headers: {
                'X-Merchant-API-Key': API_KEY,
                'X-Merchant-Signature': signature
            }
        });
        console.error('❌ FAIL: Large bet was accepted');
    } catch (error: any) {
        if (error.response?.data?.error?.includes('Wager too large')) {
            console.log('✅ PASS: Large bet was rejected correctly');
        } else {
            console.error('❌ FAIL: Unexpected error:', error.response?.data || error.message);
        }
    }

    // 2. Test Normal Wager (Within limits)
    try {
        console.log('\n[Test 2] Testing Normal Wager (Within limits)...');
        const body = {
            marketId,
            selection: 'no',
            stake: 10,
            userId: 'tester'
        };
        const signature = generateSignature(body, API_KEY);

        const res = await axios.post(`${BASE_URL}/wager`, body, {
            headers: {
                'X-Merchant-API-Key': API_KEY,
                'X-Merchant-Signature': signature
            }
        });
        console.log('✅ PASS: Normal wager accepted');
    } catch (error: any) {
        console.error('❌ FAIL: Normal wager rejected:', error.response?.data || error.message);
    }

    console.log('\n--- Verification Summary Complete ---');
}

runTests();
