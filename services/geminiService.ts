import { AiEnrichmentResponse, PricingBucket } from "../types";

export const enrichToolData = async (input: string, availableCategories: string[]): Promise<AiEnrichmentResponse> => {
  try {
    const response = await fetch('/api/enrich', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input, availableCategories }),
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }

    const data = await response.json();
    return data as AiEnrichmentResponse;

  } catch (error) {
    console.error("Enrichment Error:", error);
    return createFallback(input, availableCategories);
  }
};

const createFallback = (input: string, availableCategories: string[]): AiEnrichmentResponse => ({
    name: input,
    summary: "Could not auto-enrich. Please fill details manually.",
    bestUseCases: [],
    category: availableCategories[0] || "Other",
    tags: [],
    integrations: [],
    pricingBucket: PricingBucket.UNKNOWN,
    pricingNotes: "",
    whatItDoes: "",
});