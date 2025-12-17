import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { AiEnrichmentResponse, PricingBucket } from "../types";

const TIMEOUT_MS = 15000; // 15 seconds max for AI

export const enrichToolData = async (input: string, availableCategories: string[]): Promise<AiEnrichmentResponse> => {
  // 1. Try Client-Side SDK if API Key is available in the environment
  // This supports local previews or environments where the key is exposed to the client
  if (process.env.API_KEY) {
    try {
      console.log("Attempting client-side enrichment...");
      return await enrichWithClientSDK(input, availableCategories);
    } catch (error) {
      console.warn("Client-side enrichment failed:", error);
      // Fall through to server attempt if client fails (though likely server will fail too if key was bad)
    }
  }

  // 2. Try Server-Side API Route
  // This is for production Next.js deployments where the key is hidden server-side
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch('/api/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, availableCategories }),
      signal: controller.signal,
    });
    
    clearTimeout(id);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("API Route not found (404). If in preview, API features may be unavailable without a server.");
      }
      const text = await response.text();
      let msg = response.statusText;
      try {
          const json = JSON.parse(text);
          if (json.error) msg = json.error;
      } catch {}
      throw new Error(`Server API Error ${response.status}: ${msg}`);
    }

    const data = await response.json();
    return data as AiEnrichmentResponse;

  } catch (error: any) {
    console.error("Enrichment Service Error:", error);
    const msg = error.name === 'AbortError' ? 'Request timed out' : error.message;
    return createFallback(input, availableCategories, msg);
  }
};

const createFallback = (input: string, availableCategories: string[], errorMessage?: string): AiEnrichmentResponse => ({
    name: input,
    summary: errorMessage ? `Auto-enrich failed: ${errorMessage}` : "Could not auto-enrich. Please fill details manually.",
    bestUseCases: [],
    category: availableCategories[0] || "Other",
    tags: [],
    integrations: [],
    pricingBucket: PricingBucket.UNKNOWN,
    pricingNotes: "",
    whatItDoes: "",
});

// Client-Side Logic Implementation
async function enrichWithClientSDK(input: string, availableCategories: string[]): Promise<AiEnrichmentResponse> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const modelName = 'gemini-2.5-flash';

    const categoriesList = availableCategories.join(', ');

    const systemInstruction = `You are an expert software directory curator. 
Analyze the software tool based on the user input (name or URL).
If the input is a URL, assume the tool located at that URL. 
If it's a name, use your internal knowledge.
Provide a structured analysis suitable for a personal knowledge base.

IMPORTANT - Categorization Rules:
- You MUST strictly select one category from the following list: [${categoriesList}].
- Choose the one that fits best. If absolutely nothing fits, select 'Other'.`;

    // Define schema
    const schema = {
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
    };

    const response = await ai.models.generateContent({
        model: modelName,
        contents: input,
        config: {
            systemInstruction: systemInstruction,
            responseMimeType: "application/json",
            responseSchema: schema,
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            ],
        }
    });

    const text = response.text;
    if (!text) throw new Error("Gemini returned empty response");

    return JSON.parse(text) as AiEnrichmentResponse;
}