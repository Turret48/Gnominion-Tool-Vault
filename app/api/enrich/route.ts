import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "API_KEY is missing from server environment." },
      { status: 500 }
    );
  }

  try {
    const { input, availableCategories } = await request.json();

    if (!input) {
      return NextResponse.json({ error: "Input is required" }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const modelName = 'gemini-2.5-flash';

    const categoriesList = availableCategories ? availableCategories.join(', ') : "General";

    const systemInstruction = `You are an expert software directory curator. 
Analyze the software tool based on the user input: "${input}".

If the input is a URL, assume the tool located at that URL. 
If it's a name, use your internal knowledge.

Provide a structured analysis suitable for a personal knowledge base.

IMPORTANT - Categorization Rules:
- You MUST strictly select one category from the following list: [${categoriesList}].
- Choose the one that fits best. If absolutely nothing fits, select 'Other'.`;

    const response = await ai.models.generateContent({
        model: modelName,
        contents: input,
        config: {
            systemInstruction: systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    summary: { type: Type.STRING },
                    bestUseCases: { type: Type.ARRAY, items: { type: Type.STRING } },
                    category: { type: Type.STRING },
                    tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                    integrations: { type: Type.ARRAY, items: { type: Type.STRING } },
                    pricingBucket: { 
                        type: Type.STRING, 
                        enum: ['Free', 'Freemium', 'Paid', 'Enterprise', 'Unknown'] 
                    },
                    pricingNotes: { type: Type.STRING },
                    whatItDoes: { type: Type.STRING },
                    logoUrl: { type: Type.STRING },
                    websiteUrl: { type: Type.STRING }
                },
                required: ["name", "summary", "bestUseCases", "category", "tags", "pricingBucket"],
            },
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            ],
        }
    });

    const text = response.text;
    if (!text) throw new Error("No response text");
    const data = JSON.parse(text);
    return NextResponse.json(data);

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return NextResponse.json(
      { error: "Failed to enrich data via AI", details: error.message },
      { status: 500 }
    );
  }
}