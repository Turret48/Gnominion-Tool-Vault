
export enum PricingBucket {
  FREE = 'Free',
  FREEMIUM = 'Freemium',
  PAID = 'Paid',
  ENTERPRISE = 'Enterprise',
  UNKNOWN = 'Unknown'
}

export enum ToolStatus {
  INTERESTED = 'Interested',
  TESTING = 'Testing',
  USING = 'Using',
  NOT_USING = 'Not Using'
}

// Default categories for new users, but now just a string array helper
export const DEFAULT_CATEGORIES = [
  'Automation',
  'AI',
  'CRM',
  'Design',
  'Email',
  'Analytics',
  'Development',
  'Other'
];

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
  category: string; // Changed from enum to string for custom categories
  tags: string[];
  integrations: string[];
  pricingBucket: PricingBucket;
  pricingNotes: string;
  status: ToolStatus; // New field for tracking usage
  
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
  whatItDoes?: string;
}
