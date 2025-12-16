
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AiEnrichmentResponse, PricingBucket } from "../types";

const apiKey = process.env.API_KEY || ''; 
const ai = new GoogleGenAI({ apiKey });

const modelName = 'gemini-2.5-flash';

// Define the schema for the AI response
const toolSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "The official name of the tool" },
    summary: { type: Type.STRING, description: "A concise 1-2 sentence summary" },
    bestUseCases: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING },
      description: "3-6 bullet points of best use cases"
    },
    category: { type: Type.STRING, description: "Selected category from the provided list" },
    tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Relevant keywords/tags" },
    integrations: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Known major integrations" },
    pricingBucket: { 
      type: Type.STRING, 
      enum: Object.values(PricingBucket),
      description: "Pricing model classification" 
    },
    pricingNotes: { type: Type.STRING, description: "Brief details about pricing (e.g. 'Starts at $10/mo')" },
    whatItDoes: { type: Type.STRING, description: "A slightly more detailed explanation of functionality for the notes section" },
    logoUrl: { type: Type.STRING, description: "A valid URL to the tools logo or favicon if deducible, otherwise empty string" },
    websiteUrl: { type: Type.STRING, description: "The official homepage URL of the tool (e.g. https://www.figma.com)" }
  },
  required: ["name", "summary", "bestUseCases", "category", "tags", "pricingBucket"],
};

export const enrichToolData = async (input: string, availableCategories: string[]): Promise<AiEnrichmentResponse> => {
  try {
    const categoriesList = availableCategories.join(', ');
    
    const prompt = `
      You are an expert software directory curator. 
      Analyze the following tool based on the user input: "${input}".
      
      If the input is a URL, assume the tool located at that URL. 
      If it's a name, use your internal knowledge.
      
      Provide a structured analysis suitable for a personal knowledge base.
      The tone should be professional, objective, and concise.
      
      IMPORTANT - Categorization Rules:
      - You MUST strictly select one category from the following list: [${categoriesList}].
      - Choose the one that fits best. If absolutely nothing fits, select 'Other' or the most generic option available.
      
      For the logoUrl, prefer a high-quality logo URL if known. If uncertain, leave blank.
      Always try to identify the official website URL.
    `;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: toolSchema,
        temperature: 0.3,
      },
    });

    if (response.text) {
      return JSON.parse(response.text) as AiEnrichmentResponse;
    }
    throw new Error("No response text generated");

  } catch (error) {
    console.error("Gemini Enrichment Error:", error);
    // Return a fallback so the UI doesn't crash, allowing manual entry
    return {
      name: input,
      summary: "Could not auto-enrich. Please fill details manually.",
      bestUseCases: [],
      category: availableCategories[0] || "Other",
      tags: [],
      integrations: [],
      pricingBucket: PricingBucket.UNKNOWN,
      pricingNotes: "",
      whatItDoes: "",
    };
  }
};
