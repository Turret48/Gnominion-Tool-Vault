
export enum PricingBucket {
  FREE = 'Free',
  FREEMIUM = 'Freemium',
  PAID = 'Paid',
  ENTERPRISE = 'Enterprise',
  UNKNOWN = 'Unknown'
}

export enum ToolCategory {
  AUTOMATION = 'Automation',
  AI = 'AI',
  CRM = 'CRM',
  DESIGN = 'Design',
  EMAIL = 'Email',
  ANALYTICS = 'Analytics',
  DEV = 'Development',
  OTHER = 'Other'
}

export interface NoteSection {
  id: string;
  title: string;
  content: string;
}

export interface Tool {
  id: string;
  name: string;
  url: string;
  logoUrl?: string; // Optional URL to favicon or logo
  summary: string;
  bestUseCases: string[];
  category: ToolCategory | string;
  tags: string[];
  integrations: string[];
  pricingBucket: PricingBucket;
  pricingNotes: string;
  
  // Structured Notes
  notes: {
    whatItDoes: string;
    whenToUse: string;
    howToUse: string;
    gotchas: string;
    links: string;
  };

  createdAt: number;
  updatedAt: number;
}

export interface AiEnrichmentResponse {
  name: string;
  summary: string;
  bestUseCases: string[];
  category: string;
  tags: string[];
  integrations: string[];
  pricingBucket: PricingBucket;
  pricingNotes: string;
  logoUrl?: string;
  websiteUrl?: string;
  // Initial note suggestions
  whatItDoes?: string;
}
