import 'dotenv/config';
import { GeminiScout } from './src/agent/geminiScout';

const run = async () => {
    // Pass API Key from env if available
    const apiKey = process.env.GEMINI_API_KEY;

    // Initialize Scout
    const scout = new GeminiScout(apiKey);

    // Run 1 cycle
    await scout.run(1);

    process.exit(0);
};

run();
