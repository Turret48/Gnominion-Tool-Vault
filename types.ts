
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
  'AI',
  'Automation',
  'Analytics',
  'Backends',
  'CRM',
  'Design',
  'Development',
  'Notes',
  'Forms',
  'Productivity'
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
  overrides?: ToolOverrides;
}


export interface ToolOverrides {
  name?: string;
  websiteUrl?: string;
  summary?: string;
  logoUrl?: string;
  pricingBucket?: PricingBucket;
  pricingNotes?: string;
  bestUseCases?: string[];
  integrations?: string[];
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

export type GlobalToolStatus = 'ready' | 'enriching' | 'error';

export interface GlobalTool {
  toolId: string;
  canonicalUrl: string;
  normalizedUrl: string;
  rootDomain: string;
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
  status: GlobalToolStatus;
  enrichedAt?: number;
  enrichVersion: number;
  aliases: string[];
}


export interface UserProfile {
  name: string;
  company?: string;
  industry?: string;
  email?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface ToolCatalogEntry {
  toolId: string;
}

export interface UserTool {
  toolId: string;
  status: ToolStatus;
  notes: {
    whatItDoes: string;
    whenToUse: string;
    howToUse: string;
    gotchas: string;
    links: string;
  };
  tags: string[];
  category: string;
  overrides?: ToolOverrides;
  createdAt: number;
  updatedAt: number;
}

export type MergedTool = Tool;
