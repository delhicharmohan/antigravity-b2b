import { io } from "socket.io-client";
import axios from 'axios';

const SERVER_URL = 'http://localhost:3000'; // Default port for Express app if not specified in .env, assume 3000? 
// Wait, app.ts uses default port? Let's check app.ts or assume 3000 via httpServer.listen
// app.ts didn't have listen call! I missed that in the initial setup. I need to fix app.ts to listen.

const MERCHANT_API_KEY = process.argv[2];
const MARKET_ID = process.argv[3];

if (!MERCHANT_API_KEY || !MARKET_ID) {
    console.log("Usage: npx ts-node scripts/simulateClient.ts <API_KEY> <MARKET_ID>");
    process.exit(1);
}

const socket = io(SERVER_URL);

socket.on("connect", () => {
    console.log(`Connected to WS: ${socket.id}`);

    // Subscribe to market
    socket.emit("subscribe", MARKET_ID);
    console.log(`Subscribed to market: ${MARKET_ID}`);
});

socket.on(`markets.${MARKET_ID}.odds`, (data) => {
    console.log("\n[WS] ODDS UPDATE RECEIVED:");
    console.log(JSON.stringify(data, null, 2));
    console.log("--------------------------");
});

const placeRandomBets = async () => {
    setInterval(async () => {
        const selection = Math.random() > 0.5 ? "yes" : "no";
        const stake = Math.floor(Math.random() * 100) + 10;

        console.log(`[REST] Placing bet: ${stake} on ${selection}...`);

        try {
            const res = await axios.post(`${SERVER_URL}/v1/wager`, {
                marketId: MARKET_ID,
                selection,
                stake
            }, {
                headers: { 'X-Merchant-API-Key': MERCHANT_API_KEY }
            });
            console.log(`[REST] Response: ${res.status} - Bet ID: ${res.data.wagerId}`);
        } catch (error: any) {
            console.error(`[REST] Error: ${error.response?.data?.error || error.message}`);
        }

    }, 2000); // Place bet every 2 seconds
};

placeRandomBets();
