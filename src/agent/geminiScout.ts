import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { createMarketService } from "../services/marketService";

// Mock response for fallback
const MOCK_MARKETS = [
    {
        market_title: "Will Bitcoin (BTC) price exceed $100,000 within the next 7 days?",
        event_resolution_timestamp: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        source_of_truth: "CoinMarketCap official price data",
        confidence_score: 0.85,
        category: "Crypto"
    }
];

const marketSchema = {
    type: SchemaType.ARRAY,
    description: "A list of high-quality binary prediction markets categorized as Ultra Short Term (<7 days), Short Term (8-21 days), or Long Term (28-90 days).",
    items: {
        type: SchemaType.OBJECT,
        properties: {
            market_title: {
                type: SchemaType.STRING,
                description: "A clear, concise, and binary (Yes/No) question."
            },
            event_resolution_timestamp: {
                type: SchemaType.STRING,
                description: "The date and time (ISO 8601) when the actual event occurs and the outcome is known. Must fall within the specified term windows."
            },
            source_of_truth: {
                type: SchemaType.STRING,
                description: "The verifiable source that will determine the outcome."
            },
            confidence_score: {
                type: SchemaType.NUMBER,
                description: "The agent's confidence (0.75 to 0.95) in the topic's relevance and verifiability."
            },
            category: {
                type: SchemaType.STRING,
                description: "The market category. Must be one of: Crypto, Finance, NFL, Politics, NBA, Cricket, Football, Election, Other."
            },
            term: {
                type: SchemaType.STRING,
                description: "The term of the market: 'Ultra Short' (<7 days), 'Short' (8-21 days), or 'Long' (28-90 days)."
            }
        },
        required: ["market_title", "event_resolution_timestamp", "source_of_truth", "confidence_score", "category", "term"]
    }
};

export class GeminiScout {
    private genAI: GoogleGenerativeAI | null = null;
    private model: any = null;

    constructor(apiKey?: string) {
        if (apiKey && apiKey !== 'PLACE_YOUR_API_KEY_HERE') {
            this.genAI = new GoogleGenerativeAI(apiKey);
            this.model = this.genAI.getGenerativeModel({
                model: "gemini-2.0-flash",
                tools: [
                    {
                        googleSearch: {}
                    } as any,
                ]
            });
        }
    }

    async generateMarkets(query?: string, count: number = 15): Promise<any[]> {
        if (!this.model) {
            console.log("[Scout] No valid API Key. Returning mock markets.");
            return MOCK_MARKETS;
        }

        console.log(`[Scout] Using model: ${this.model.model}`);

        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const day7 = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const day8 = new Date(today.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const day21 = new Date(today.getTime() + 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const day28 = new Date(today.getTime() + 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const day90 = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const queryContext = query ? `
        🎯 TARGETED INTENT: "${query}"
        The user wants markets specifically related to this intent. Prioritize fulfilling this request while maintaining the resolution rules for Ultra Short, Short, and Long term markets.
        ` : 'Generate diverse markets across the specified categories and terms.';

        const prompt = `
        You are an expert Prediction Market Analyst specializing in multi-horizon event forecasting.
        
        🌐 GROUNDING & VERIFICATION:
        You MUST use Google Search to verify ACTUAL upcoming schedules, match dates, team lineups, and event details.
        
        🚨 STICK TO FACTS:
        - DO NOT confuse Under-19 (U19), Women's, or 'A' teams with Senior National Teams.
        - DO NOT attribute matches to players who are not in the squad or retired.
        - If you see "Under 19 tour", clearly label the market as "U19".
        - Verify match dates against today's date (${todayStr}).
        - If an event is not found or the date is incorrect, DO NOT generate a market for it.
        
        🚨 CRITICAL REQUIREMENTS:
        - Today is ${todayStr}
        - Generate ${count} markets across these three categories:
            1. 🚀 ULTRA SHORT TERM: Resolution within 7 days (by ${day7}).
            2. ⏱️ SHORT TERM: Resolution between 8 to 21 days (from ${day8} to ${day21}).
            3. 📅 LONG TERM: Resolution between 28 to 90 days (from ${day28} to ${day90}).
        - ALL markets must have verifiable outcomes within their respective windows.
        - Use SPECIFIC numbers, dates, and events.
        ${queryContext}
        
        📊 FINANCE, STOCKS & CRYPTO REALISM:
        - You MUST use Google Search to find the CURRENT PRICE of any stock, index, or crypto before creating a market.
        - Targets MUST be realistic for the 1-7 day resolution window.
        - VOLATILITY RULES:
            - Stocks/Indexes: Targets should typically be within +/- 2-5% of current price.
            - Crypto (BTC/ETH): Targets should typically be within +/- 5-10% of current price.
        - HANDLING OUTLIERS:
            - If a user intent asks for an unrealistic price (e.g., "Will Reliance reach 6000?" when it is at 3000):
                1. Adjust the target to a "Closer Target Price" (e.g., "Will Reliance exceed 3100?") to ensure a balanced YES/NO probability.
                2. If you MUST create an "impossible" market, set the confidence_score to reflect the extreme low probability (0.70-0.75 range) and explicitly state the current price in the source_of_truth description.
        
        📊 CRICKET & SPORTS:
        If applicable, generate specific match or player performance markets.
        - For CRICKET, you MUST use https://cricbuzz.com as the source_of_truth, UNLESS it is for IPL (Indian Premier League), then use https://www.iplt20.com/.
        - For FOOTBALL (Soccer), you MUST use https://onefootball.com as the source_of_truth.
        - For NFL (American Football), you MUST use https://www.nfl.com/schedules as the source_of_truth.
        - For NBA (Basketball), you MUST use https://www.nba.com/schedule as the source_of_truth.
        
        ⚠️ STRICT RULES:
        1. Resolution dates MUST fall exactly within the Ultra Short, Short, or Long term windows defined above.
        2. Use ACTUAL match times and dates.
        3. Confidence: 0.80-0.95 (High confidence in the DATA and EVENT occurrence).
        4. source_of_truth: You MUST provide the DIRECT URL to the data source (e.g., Yahoo Finance, CoinMarketCap, Cricbuzz).
        5. CATEGORIES: Categorize each market as: Crypto, Finance, NFL, Politics, NBA, Cricket, Football, or Election.
        6. TERM: You MUST label each market's term correctly.
        
        Generate ${count} markets based on the intent if provided, otherwise diverse across categories and terms.
        
        RETURN ONLY A VALID JSON ARRAY. DO NOT include conversational text.
        JSON format:
        [
          {
            "market_title": "Will [Asset] reach [Target Price] by [Date]?",
            "event_resolution_timestamp": "ISO8601",
            "source_of_truth": "URL",
            "confidence_score": 0.85,
            "category": "...",
            "term": "Ultra Short" | "Short" | "Long"
          }
        ]
        `;

        try {
            console.log(`[Scout] Generating ${count} markets across Ultra Short, Short, and Long terms...`);
            const result = await this.model.generateContent(prompt);
            const response = result.response;
            const text = response.text();
            console.log("[Scout] AI Response received.");

            // Clean up potentially wrapped JSON in markdown blocks
            const cleanText = text.replace(/```json|```/g, '').trim();
            const markets = JSON.parse(cleanText);
            console.log(`[Scout] Generated ${markets.length} short-term markets.`);
            return markets;
        } catch (error) {
            console.error("[Scout] Generation failed:", error);
            return MOCK_MARKETS;
        }
    }

    async run(cycles: number = 1, query?: string, count?: number) {
        console.log(`[Scout] Starting Multi-Horizon Market Scout (${cycles} cycles)... ${query ? `with query: ${query}` : ''}`);

        const marketsToGenerate = count || 15;

        for (let i = 0; i < cycles; i++) {
            const markets = await this.generateMarkets(query, marketsToGenerate);

            for (const m of markets) {
                console.log(`[Scout] Validating: ${m.market_title} (Confidence: ${m.confidence_score})`);

                const resolutionTime = new Date(m.event_resolution_timestamp).getTime();
                const now = Date.now();
                const ninetyDaysFromNow = now + (90 * 24 * 60 * 60 * 1000);

                if (isNaN(resolutionTime)) {
                    console.warn(`[Scout] SKIPPING: Invalid resolution timestamp for "${m.market_title}"`);
                    continue;
                }

                if (resolutionTime < now) {
                    console.warn(`[Scout] SKIPPING: Resolution date is in the past!`);
                    continue;
                }

                if (resolutionTime > ninetyDaysFromNow) {
                    console.warn(`[Scout] SKIPPING: Resolution date is more than 90 days away!`);
                    continue;
                }

                // Betting closes 30 minutes before resolution
                const closureTime = resolutionTime - (30 * 60 * 1000);

                try {
                    // Logic: Initialize pools based on confidence score
                    const liquidity = Math.floor(m.confidence_score * 1000);

                    const created = await createMarketService(
                        m.market_title,
                        closureTime,
                        liquidity,
                        liquidity,
                        m.source_of_truth,
                        m.confidence_score,
                        resolutionTime,
                        m.category,
                        m.term
                    );
                    console.log(`[Scout] ✅ Created Market ID ${created.id} (Betting closes at ${new Date(closureTime).toLocaleTimeString()})`);
                } catch (e) {
                    console.error(`[Scout] ❌ EXECUTE FAILED: ${e}`);
                }
            }
        }
        console.log("[Scout] Mission Complete.");
    }
}
