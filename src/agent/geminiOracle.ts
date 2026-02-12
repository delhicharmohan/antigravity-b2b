import { GoogleGenerativeAI } from "@google/generative-ai";
import { query } from "../config/db";
import { settleMarket } from "../services/marketService";
import { LoggerService } from "../services/loggerService";
import { extractJson } from "../utils/jsonUtils";

export class GeminiOracle {
    private genAI: GoogleGenerativeAI | null = null;
    private model: any = null;

    constructor(apiKey?: string) {
        const key = apiKey || process.env.GEMINI_API_KEY;
        if (key && key !== 'PLACE_YOUR_API_KEY_HERE') {
            this.genAI = new GoogleGenerativeAI(key);
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

    /**
     * Resolves a market using the Red-Team Consensus model.
     * 1. Researcher: Fetches evidence.
     * 2. Judge: Verifies evidence.
     * 3. Settlement: Updates DB.
     */
    public async resolveMarket(marketId: string) {
        if (!this.model) {
            await LoggerService.error("[Oracle] Configuration Error: No valid API Key. Settlement aborted.", { marketId });
            return;
        }

        await LoggerService.info(`[Oracle] 🔍 Starting resolution for Market ${marketId}...`, { marketId });

        try {
            const marketRes = await query("SELECT * FROM markets WHERE id = $1", [marketId]);
            if (marketRes.rows.length === 0) {
                await LoggerService.warn(`[Oracle] Market ${marketId} not found.`, { marketId });
                return;
            }
            const market = marketRes.rows[0];

            if (market.status === 'SETTLED') {
                await LoggerService.info(`[Oracle] Market ${marketId} already settled. Skipping.`, { marketId });
                return;
            }

            // Step 1: Researcher Call
            await LoggerService.info(`[Oracle] 🕵️ Researcher analyzing: "${market.title}"`, { marketId, step: 'RESEARCH' });

            const researcherPrompt = `
            You are a meticulous Financial Researcher. Your task is to determine the outcome of a prediction market.
            
            MARKET: "${market.title}"
            SOURCE OF TRUTH: "${market.source_of_truth}"
            
            RULES:
            1. Search for the latest news and data regarding this specific event.
            2. Provide a detailed summary of your findings (Evidence).
            3. Conclude with a clear outcome: "yes" or "no".
            4. If the result is not yet available, state "NOT_YET_AVAILABLE".
            
            Return your response in JSON format:
            {
                "evidence": "Detailed explanation of what happened...",
                "proposed_outcome": "yes" | "no" | "NOT_YET_AVAILABLE",
                "confidence": 0.0 to 1.0
            }
            `;

            const researcherResult = await this.model.generateContent(researcherPrompt);
            let researcherText = researcherResult.response.text();

            const researcherResponse = extractJson(researcherText);

            if (researcherResponse.proposed_outcome === 'NOT_YET_AVAILABLE') {
                await LoggerService.info(`[Oracle] ⏳ Result not yet available for Market ${marketId}.`, { marketId });
                return;
            }

            // Pacing: add small delay between steps
            await this.sleep(1000);

            // Step 2: Judge Call (Red-Teaming)
            await LoggerService.info(`[Oracle] ⚖️ Judge verifying evidence for outcome: ${researcherResponse.proposed_outcome}`, { marketId, step: 'JUDGE', evidence: researcherResponse.evidence });

            const judgePrompt = `
            You are a cynical Auditor and Judge. You must verify if a Researcher's conclusion about a prediction market is correct.
            
            MARKET: "${market.title}"
            RESEARCHER'S EVIDENCE: "${researcherResponse.evidence}"
            PROPOSED OUTCOME: "${researcherResponse.proposed_outcome}"
            
            YOUR TASK:
            1. Critically analyze the evidence. Does it actually support the outcome for this specific question?
            2. If the evidence seems incomplete, contradictory, or suspicious, use Google Search to cross-verify.
            3. Check for bias, misinterpretation of numbers, or date errors.
            4. Agree or Disagree with the outcome.
            
            Return your response in JSON format:
            {
                "verdict": "agree" | "disagree",
                "reasoning": "Why you agree or disagree...",
                "final_outcome": "yes" | "no"
            }
            `;

            const judgeResult = await this.model.generateContent(judgePrompt);
            let judgeText = judgeResult.response.text();

            const judgeResponse = extractJson(judgeText);

            if (judgeResponse.verdict === 'agree' && researcherResponse.proposed_outcome === judgeResponse.final_outcome) {
                await LoggerService.info(`[Oracle] ✅ Consensus reached: ${judgeResponse.final_outcome.toUpperCase()}`, { marketId, reasoning: judgeResponse.reasoning });
                await settleMarket(marketId, judgeResponse.final_outcome as 'yes' | 'no');
            } else {
                await LoggerService.warn(`[Oracle] ⚠️ Dispute detected for Market ${marketId}. Verdict: ${judgeResponse.verdict}`, { marketId, judgeResponse, researcherResponse });
                await query("UPDATE markets SET status = 'DISPUTED' WHERE id = $1", [marketId]);
            }

        } catch (error: any) {
            const isQuotaError = error.message.includes('429') || error.message.includes('Quota');

            if (isQuotaError) {
                await LoggerService.error(`[Oracle] 🛑 Quota Exceeded (429) for Market ${marketId}. Throttling required.`, { marketId });
                // We could implement a manual delay here, but for now we let the next scheduled run pick it up
                return;
            }

            await LoggerService.error(`[Oracle] ❌ Resolution failed for Market ${marketId}`, { marketId, error: error.message });
        }
    }

    private sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export const geminiOracle = new GeminiOracle();
