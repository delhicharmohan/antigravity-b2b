import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
dotenv.config();

async function listModels() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const modelsToTest = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.0-flash-exp", "gemini-flash-latest"];

    for (const m of modelsToTest) {
        try {
            console.log(`Checking ${m}...`);
            const model = genAI.getGenerativeModel({ model: m });
            const result = await model.generateContent("test");
            console.log(`Success with ${m}`);
        } catch (e: any) {
            console.error(`Error with ${m}:`, e.message);
        }
    }
}

listModels();
