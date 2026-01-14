import { query, getClient } from '../src/config/db';
import crypto from 'crypto';

const onboardMerchant = async () => {
    const merchantName = process.argv[2] || 'Default Merchant';

    // Generate a random API Key
    const apiKey = crypto.randomBytes(32).toString('hex');
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    const config = {
        name: merchantName,
        default_rake: 0.05,
        allowed_categories: ['sports', 'politics']
    };

    try {
        const res = await query(
            'INSERT INTO merchants (api_key_hash, config) VALUES ($1, $2) RETURNING id',
            [apiKeyHash, config]
        );

        console.log('Merchant Onboarded Successfully!');
        console.log('--------------------------------');
        console.log(`Merchant ID: ${res.rows[0].id}`);
        console.log(`API Key:     ${apiKey}`);
        console.log('--------------------------------');
        console.log('SAVE THIS KEY! It cannot be retrieved again.');

        process.exit(0);
    } catch (error) {
        console.error('Failed to onboard merchant:', error);
        process.exit(1);
    }
};

onboardMerchant();
