import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import dotenv from 'dotenv';
dotenv.config();

const marketSchema = {
    type: SchemaType.ARRAY,
    items: {
        type: SchemaType.OBJECT,
        properties: {
            market_title: { type: SchemaType.STRING }
        },
        required: ["market_title"]
    }
};

async function testSchema() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    try {
        console.log("Testing gemini-2.0-flash with schema...");
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: marketSchema as any
            }
        });
        const result = await model.generateContent("generate 1 test market");
        console.log("Success with schema!");
    } catch (e: any) {
        console.error("Error with schema:", e.message);
    }
}

testSchema();
