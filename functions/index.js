const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { GoogleGenAI, Type } = require("@google/genai");
const logger = require("firebase-functions/logger");

// Define the schema
const toolSchema = {
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
      enum: ['Free', 'Freemium', 'Paid', 'Enterprise', 'Unknown'],
      description: "Pricing model classification" 
    },
    pricingNotes: { type: Type.STRING, description: "Brief details about pricing" },
    whatItDoes: { type: Type.STRING, description: "Detailed explanation" },
    logoUrl: { type: Type.STRING, description: "URL to logo if known" },
    websiteUrl: { type: Type.STRING, description: "Official homepage URL" }
  },
  required: ["name", "summary", "bestUseCases", "category", "tags", "pricingBucket"],
};

exports.enrichTool = onCall({ secrets: ["API_KEY"] }, async (request) => {
  // Ensure the user is logged in
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    logger.error("API_KEY secret is missing");
    throw new HttpsError('failed-precondition', 'Server API configuration is missing.');
  }

  const { input, availableCategories } = request.data;
  
  if (!input) {
    throw new HttpsError('invalid-argument', 'The function must be called with an input string.');
  }

  try {
    // Initialize AI client here to ensure secret is loaded
    const ai = new GoogleGenAI({ apiKey: apiKey });
    const modelName = 'gemini-2.5-flash';

    const categoriesList = availableCategories ? availableCategories.join(', ') : "General";
    
    const prompt = `
      You are an expert software directory curator. 
      Analyze the following tool based on the user input: "${input}".
      
      If the input is a URL, assume the tool located at that URL. 
      If it's a name, use your internal knowledge.
      
      Provide a structured analysis suitable for a personal knowledge base.
      
      IMPORTANT - Categorization Rules:
      - You MUST strictly select one category from the following list: [${categoriesList}].
      - Choose the one that fits best. If absolutely nothing fits, select 'Other'.
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
      return JSON.parse(response.text);
    }
    
    throw new Error("No response text generated");

  } catch (error) {
    logger.error("Gemini Error", error);
    throw new HttpsError('internal', 'Failed to enrich tool data', error);
  }
});