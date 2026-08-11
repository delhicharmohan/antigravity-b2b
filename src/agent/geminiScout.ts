import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { createMarketService } from "../services/marketService";
import { extractJson } from "../utils/jsonUtils";

// Mock response for fallback
const MOCK_MARKETS = [
    {
        market_type: "BINARY",
        market_title: "Will Bitcoin (BTC) price exceed $100,000 within the next 7 days?",
        event_resolution_timestamp: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        source_of_truth: "CoinMarketCap official price data",
        confidence_score: 0.85,
        category: "Crypto",
        term: "Ultra Short",
        initial_probability_yes: 0.55
    },
    {
        market_type: "MULTI",
        market_title: "Which major tech company will report the highest revenue growth this quarter?",
        event_resolution_timestamp: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        source_of_truth: "SEC filings and earnings reports",
        confidence_score: 0.80,
        category: "Tech",
        term: "Long",
        options: ["Apple", "Microsoft", "NVIDIA", "Google", "Amazon"],
        initial_liquidity: 1500
    }
];

export class GeminiScout {
    private genAI: GoogleGenerativeAI | null = null;
    private model: any = null;

    constructor(apiKey?: string) {
        if (apiKey && apiKey !== 'PLACE_YOUR_API_KEY_HERE') {
            this.genAI = new GoogleGenerativeAI(apiKey);
            this.model = this.genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
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
        The user wants markets specifically related to this intent. Prioritize fulfilling this request while maintaining diversity in market types (binary AND multi-option) and resolution windows.
        ` : 'Generate diverse markets across ALL categories. Do NOT cluster on just Crypto/Finance.';

        const prompt = `
        You are an expert Prediction Market Analyst working for a platform competing with Kalshi and Polymarket.
        Your job is to create ENGAGING, DIVERSE, and VERIFIABLE prediction markets that attract a wide audience.
        
        🌐 GROUNDING & VERIFICATION:
        You MUST use Google Search to verify ACTUAL upcoming schedules, events, dates, and data.
        
        📅 TODAY: ${todayStr}
        
        ===========================
        MARKET TYPES (CRITICAL!)
        ===========================
        
        You MUST generate TWO types of markets:
        
        1️⃣ BINARY MARKETS (Yes/No questions):
           Set market_type = "BINARY"
           Example: "Will the Federal Reserve cut rates at the September FOMC meeting?"
           These need: initial_probability_yes (0.05-0.95)
        
        2️⃣ MULTI-OPTION MARKETS (Who/Which/What questions with 3-8 choices):
           Set market_type = "MULTI"  
           Example: "Which country will win the most gold medals at the 2026 Asian Games?"
           These need: options (array of 3-8 choices), initial_liquidity (number, typically 1000-2000)
        
        🎯 MIX REQUIREMENT: Out of ${count} markets, generate AT LEAST 4 MULTI-OPTION markets.
        
        ===========================
        CATEGORIES (USE ALL OF THEM!)
        ===========================
        
        You MUST spread markets across these categories. Use AT LEAST 6 different categories:
        
        🏦 Economy — Fed rate decisions, inflation data, jobs reports, GDP, unemployment claims, CPI
           Binary: "Will US CPI for August come in below 3%?"
           Multi: "What will the Fed's rate decision be at the next FOMC?" → [Cut 25bps, Cut 50bps, Hold, Raise 25bps]
        
        💰 Crypto — Bitcoin, Ethereum, altcoin milestones, DeFi events, ETF flows, halving effects
           Binary: "Will Bitcoin exceed $85,000 by ${day7}?"
           Multi: "Which crypto will have the highest % gain this week?" → [BTC, ETH, SOL, XRP, BNB]
        
        📈 Finance — Earnings, IPOs, M&A, stock milestones, market indices, commodity prices
           Binary: "Will NVIDIA's market cap exceed $4 trillion by ${day21}?"
           Multi: "Which tech stock will outperform this quarter?" → [AAPL, MSFT, GOOGL, NVDA, META]
        
        🏏 Cricket — International matches, IPL, World Cup, player milestones, series outcomes
           Binary: "Will India win the 3rd Test against England?"
           Multi: "Who will be Player of the Match in the next India vs Australia ODI?" → [Kohli, Sharma, Smith, Cummins, Gill]
        
        ⚽ Football — Premier League, Champions League, La Liga, transfers, international matches
           Binary: "Will Manchester City win their next Premier League match?"
           Multi: "Who will win the Champions League 2026-27?" → [Real Madrid, Man City, Bayern Munich, PSG, Arsenal]
        
        🏈 NFL — Regular season, playoffs, player stats, draft picks, divisional races
           Binary: "Will the Chiefs win their Week 1 opener?"
           Multi: "Which team will win Super Bowl LXI?" → [Chiefs, Eagles, 49ers, Bills, Lions]
        
        🏀 NBA — Season games, playoffs, MVP race, trade impacts, scoring records
           Binary: "Will LeBron James score 30+ points in his next game?"
           Multi: "Who will win NBA MVP 2026-27?" → [Jokic, Luka, Tatum, Giannis, Shai]
        
        🗳️ Politics — Legislation, government actions, policy decisions, approval ratings
           Binary: "Will the US Senate pass the infrastructure bill by September?"
           Multi: "Which party will win the most seats in the next state election?" → [BJP, Congress, AAP, TMC, JDU]
        
        🗳️ Election — Upcoming elections, primary results, polling milestones
           Binary: "Will voter turnout exceed 65% in the next UK general election?"
           Multi: "Who will win the next presidential election in [country]?" → [Candidate A, B, C, D]
        
        🔬 Science — Space launches, climate records, scientific breakthroughs, Nobel predictions
           Binary: "Will SpaceX successfully launch Starship before ${day21}?"
           Multi: "Which country will land a spacecraft on the Moon next?" → [USA, China, India, Japan]
        
        💻 Tech — Product launches, AI milestones, app store rankings, company earnings, IPOs
           Binary: "Will Apple announce a new iPhone at its September event?"
           Multi: "Which AI model will top the LMSYS leaderboard by end of month?" → [GPT-5, Claude 4, Gemini 2.5, Llama 4]
        
        🌦️ Weather — Hurricane forecasts, temperature records, seasonal outliers, wildfire events
           Binary: "Will a Category 4+ hurricane make US landfall in August 2026?"
           Multi: "Which US city will record the highest temperature this week?" → [Phoenix, Las Vegas, Dallas, Houston, Miami]
        
        🌍 Geopolitics — Sanctions, treaties, UN votes, trade disputes, military actions
           Binary: "Will the EU impose new sanctions on Russia by September?"
           Multi: "Which country will be the next to join BRICS?" → [Turkey, Indonesia, Nigeria, Saudi Arabia, Thailand]
        
        🎬 Culture — Awards shows, box office, streaming records, viral moments, celebrity events
           Binary: "Will the next Marvel movie gross $1B worldwide?"
           Multi: "Which film will top the global box office this month?" → [Movie A, Movie B, Movie C, Movie D]
        
        🏅 Sports — Olympics, Tennis Grand Slams, F1, Golf majors, combat sports, esports
           Binary: "Will Max Verstappen win the next F1 Grand Prix?"
           Multi: "Who will win the next Tennis Grand Slam men's singles?" → [Djokovic, Sinner, Alcaraz, Medvedev]
        
        ===========================
        TERM WINDOWS
        ===========================
        
        Spread markets across these horizons:
        1. 🚀 ULTRA SHORT: Resolution within 7 days (by ${day7})
        2. ⏱️ SHORT: Resolution 8-21 days (${day8} to ${day21})
        3. 📅 LONG: Resolution 28-90 days (${day28} to ${day90})
        
        ===========================
        STRICT RULES
        ===========================
        
        🚨 DIVERSITY:
        - NO category may appear more than 3 times in a batch of ${count}
        - At least 6 different categories MUST be represented
        - At least 4 markets MUST be market_type "MULTI"
        - Mix binary and multi-option across categories
        
        🚨 FACTS ONLY:
        - DO NOT confuse U19/Women's/A-team events with Senior teams
        - Verify match dates against today (${todayStr})
        - If an event is NOT found or date is WRONG, skip it
        - Use SPECIFIC numbers, dates, teams, and names
        
        📊 FINANCE/CRYPTO REALISM:
        - Search for CURRENT PRICES before setting targets
        - Stocks/Indexes: +/- 2-5% of current price for short-term
        - Crypto: +/- 5-10% for short-term
        
        📊 SOURCES:
        - Provide DIRECT URLs as source_of_truth (Yahoo Finance, CoinMarketCap, ESPN, Cricbuzz, etc.)
        - For Football: use https://onefootball.com
        - For NFL: use https://www.nfl.com/schedules
        - For NBA: use https://www.nba.com/schedule
        
        ${queryContext}
        
        ===========================
        OUTPUT FORMAT
        ===========================
        
        Return ONLY a JSON array. No markdown, no explanation.
        
        For BINARY markets:
        {
          "market_type": "BINARY",
          "market_title": "Will [X] happen by [date]?",
          "event_resolution_timestamp": "ISO8601",
          "source_of_truth": "URL",
          "confidence_score": 0.85,
          "category": "Economy",
          "term": "Ultra Short",
          "initial_probability_yes": 0.65
        }
        
        For MULTI-OPTION markets:
        {
          "market_type": "MULTI",
          "market_title": "Which/Who/What [question]?",
          "event_resolution_timestamp": "ISO8601",
          "source_of_truth": "URL",
          "confidence_score": 0.85,
          "category": "Football",
          "term": "Short",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "initial_liquidity": 1500
        }
        
        Generate ${count} markets NOW.
        `;

        try {
            console.log(`[Scout] Generating ${count} diverse markets (binary + multi-option)...`);
            const result = await this.model.generateContent(prompt);
            const response = result.response;
            const text = response.text();
            console.log("[Scout] AI Response received.");

            const markets = extractJson(text);
            
            // Log diversity stats
            const types = { BINARY: 0, MULTI: 0 };
            const categories: Record<string, number> = {};
            for (const m of markets) {
                const t = m.market_type || 'BINARY';
                types[t as keyof typeof types] = (types[t as keyof typeof types] || 0) + 1;
                categories[m.category] = (categories[m.category] || 0) + 1;
            }
            console.log(`[Scout] Generated ${markets.length} markets — Binary: ${types.BINARY}, Multi: ${types.MULTI}`);
            console.log(`[Scout] Category spread: ${JSON.stringify(categories)}`);
            
            return markets;
        } catch (error) {
            console.error("[Scout] Generation failed:", error);
            return MOCK_MARKETS;
        }
    }

    async getTrends(): Promise<any> {
        if (!this.model) {
            return {
                x: ["#Bitcoin", "#FedRate", "#ChampionsLeague"],
                google: ["Stock Market Today", "US Election", "Tech Earnings"],
                news: ["AI Regulations", "Global Inflation", "Tech Earnings"],
                ai_recommendations: [
                    { keyword: "NVIDIA Earnings", context: "Anticipation for quarterly results driving tech sector volatility." },
                    { keyword: "OPEC+ Meeting", context: "Potential oil supply cuts affecting global energy prices." }
                ]
            };
        }

        const prompt = `
        You are a Trend Analysis Agent. 
        You MUST use Google Search to find ACTUAL, REAL-TIME trending keywords, topics, and events (as of today, ${new Date().toISOString().split('T')[0]}) from:
        1. X (formerly Twitter) Trending Topics
        2. Google Trends (Global and regional highlights)
        3. Global News (Finance, Tech, Sports, Politics, Science, Entertainment)

        Provide a categorized list of high-impact keywords that would make excellent prediction markets (both binary Yes/No AND multi-option Who/Which/What).
        Focus on events resolving within the next 1-90 days.

        Return ONLY a JSON object with this structure:
        {
          "x": ["keyword1", "keyword2", ...],
          "google": ["keyword1", "keyword2", ...],
          "news": ["keyword1", "keyword2", ...],
          "ai_recommendations": [
            {"keyword": "...", "context": "Brief context on why it's trending and what type of market it suits (binary or multi-option)"}
          ]
        }
        `;

        try {
            console.log("[Scout] Fetching real-time trends using Google Search grounding...");
            const result = await this.model.generateContent(prompt);
            const text = result.response.text();
            return extractJson(text);
        } catch (error) {
            console.error("[Scout] Trends fetch failed:", error);
            return { x: [], google: [], news: [], ai_recommendations: [] };
        }
    }

    async run(cycles: number = 1, query?: string, count?: number) {
        console.log(`[Scout] Starting Diverse Market Scout (${cycles} cycles)... ${query ? `with query: ${query}` : ''}`);

        const marketsToGenerate = count || 15;

        for (let i = 0; i < cycles; i++) {
            const markets = await this.generateMarkets(query, marketsToGenerate);

            for (const m of markets) {
                const marketType = (m.market_type || 'BINARY').toUpperCase();
                const label = marketType === 'MULTI' 
                    ? `[MULTI:${(m.options || []).length}opts]` 
                    : '[BINARY]';
                
                console.log(`[Scout] ${label} Validating: ${m.market_title} (Confidence: ${m.confidence_score})`);

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

                // Validate multi-option markets have enough options
                if (marketType === 'MULTI') {
                    if (!m.options || !Array.isArray(m.options) || m.options.length < 2) {
                        console.warn(`[Scout] SKIPPING: MULTI market "${m.market_title}" has insufficient options`);
                        continue;
                    }
                }

                // Betting closes 30 minutes before resolution
                const closureTime = resolutionTime - (30 * 60 * 1000);

                try {
                    if (marketType === 'MULTI') {
                        // Multi-option market creation
                        const liquidity = m.initial_liquidity || Math.floor((m.confidence_score || 0.85) * 2000);

                        const created = await createMarketService(
                            m.market_title,
                            closureTime,
                            0,    // initYes (unused for MULTI)
                            0,    // initNo (unused for MULTI)
                            m.source_of_truth,
                            m.confidence_score,
                            resolutionTime,
                            m.category || 'Other',
                            m.term || 'Short',
                            'MULTI',
                            m.options,
                            undefined, // groupId
                            liquidity
                        );
                        console.log(`[Scout] ✅ Created MULTI Market ID ${created.id} — ${m.options.length} options, ${liquidity} liquidity`);
                    } else {
                        // Binary market creation (existing logic)
                        const totalLiquidity = Math.floor((m.confidence_score || 0.85) * 2000);
                        const probYes = m.initial_probability_yes || 0.5;
                        const liquidityYes = Math.floor(totalLiquidity * probYes);
                        const liquidityNo = totalLiquidity - liquidityYes;

                        const created = await createMarketService(
                            m.market_title,
                            closureTime,
                            liquidityYes,
                            liquidityNo,
                            m.source_of_truth,
                            m.confidence_score,
                            resolutionTime,
                            m.category || 'Other',
                            m.term || 'Ultra Short'
                        );
                        console.log(`[Scout] ✅ Created BINARY Market ID ${created.id} (YES: ${liquidityYes}, NO: ${liquidityNo})`);
                    }
                } catch (e) {
                    console.error(`[Scout] ❌ EXECUTE FAILED: ${e}`);
                }
            }
        }
        console.log("[Scout] Mission Complete.");
    }
}
