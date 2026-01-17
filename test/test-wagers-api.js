
const axios = require('axios');

async function testApi() {
    const ADMIN_URL = 'http://localhost:3000/admin';
    const token = 'antigravity_admin_2024';

    try {
        const res = await axios.get(`${ADMIN_URL}/wagers`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Response type:', typeof res.data);
        console.log('Is array:', Array.isArray(res.data));
        console.log('Data:', JSON.stringify(res.data, null, 2));
    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
    }
}

testApi();
