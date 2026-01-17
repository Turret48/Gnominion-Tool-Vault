'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Search, Plus, X, LayoutGrid, List as ListIcon, Database, ArrowUpRight, Hash, Tag, 
  Check, Save, Trash2, Download, Upload, Cpu, Zap, PenTool, Pencil, BarChart2, AlertTriangle, Menu,
  Settings, LogOut, User as UserIcon, BookOpen, Users, FileText, ClipboardList, CalendarClock, Code
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Tool, UserTool, GlobalTool, PricingBucket, ToolStatus, DEFAULT_CATEGORIES, UserProfile } from '../types';
import {
  exportData,
  subscribeToUserTools,
  subscribeToCategories,
  addUserToolToFirestore,
  updateUserToolInFirestore,
  deleteUserToolFromFirestore,
  syncCategoriesToFirestore,
  fetchGlobalTools,
  fetchCatalogEntries,
  fetchUserProfile,
  saveUserProfile,
  clearUserProfile,
} from '../services/storageService';
import { enrichToolData } from '../services/geminiService';
import { useAuth } from '../context/AuthContext';
import { signInWithAuth0, logOut } from '../services/auth';
import { updateGlobalTool } from '../services/globalToolService';
import { addToolToCatalog } from '../services/catalogService';

// 0. Shared UI Components & Helpers
const EMPTY_NOTES = {
  whatItDoes: '',
  whenToUse: '',
  howToUse: '',
  gotchas: '',
  links: ''
};

const MAX_CATEGORY_LENGTH = 26;

const INDUSTRY_OPTIONS = [
  'Technology',
  'Software / SaaS',
  'Agency / Consulting',
  'Freelance / Independent',
  'E-commerce',
  'Marketing / Advertising',
  'Design / Creative',
  'Finance / Fintech',
  'Healthcare',
  'Education',
  'Media / Content',
  'Nonprofit',
  'Student',
  'Hobby / Personal Projects',
  'Other',
];

const CATEGORY_SYNONYMS: Record<string, string> = {
  'dev tools': 'Development',
  'devtools': 'Development',
  'knowledge base': 'Notes',
  'knowledgebase': 'Notes',
  'docs': 'Notes',
  'documentation': 'Notes',
  'doc': 'Notes',
  'email': 'CRM',
  'data': 'Analytics',
  'form': 'Forms',
  'forms': 'Forms',
  'backend': 'Backends',
  'back end': 'Backends',
  'infrastructure': 'Backends',
  'other': 'Productivity'
};

const DEFAULT_CATEGORY_LOOKUP = new Map(
  DEFAULT_CATEGORIES.map((cat) => [cat.toLowerCase(), cat])
);

const normalizeCategory = (cat: string) => {
  const trimmed = cat.trim().slice(0, MAX_CATEGORY_LENGTH);
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  return CATEGORY_SYNONYMS[lower] || DEFAULT_CATEGORY_LOOKUP.get(lower) || trimmed;
};

const normalizeCategories = (cats: string[]) => (
  Array.from(new Set(
    cats
      .map((cat) => normalizeCategory(cat))
      .filter(Boolean)
  )).sort()
);

const mergeWithDefaultCategories = (cats: string[]) => (
  Array.from(new Set([...DEFAULT_CATEGORIES, ...normalizeCategories(cats)])).sort()
);



const mergeGlobalAndUser = (globalTool: any, userTool: UserTool): Tool => {
  const overrides = userTool.overrides || {};
  const notes = userTool.notes || EMPTY_NOTES;
  return {
    id: userTool.toolId,
    name: overrides.name ?? globalTool?.name ?? userTool.toolId,
    url: overrides.websiteUrl ?? globalTool?.websiteUrl ?? globalTool?.canonicalUrl ?? '',
    logoUrl: overrides.logoUrl ?? globalTool?.logoUrl ?? '',
    summary: overrides.summary ?? globalTool?.summary ?? '',
    bestUseCases: overrides.bestUseCases ?? globalTool?.bestUseCases ?? [],
    category: normalizeCategory(userTool.category || globalTool?.category || 'Productivity'),
    tags: userTool.tags || globalTool?.tags || [],
    integrations: overrides.integrations ?? globalTool?.integrations ?? [],
    pricingBucket: overrides.pricingBucket ?? globalTool?.pricingBucket ?? PricingBucket.UNKNOWN,
    pricingNotes: overrides.pricingNotes ?? globalTool?.pricingNotes ?? '',
    status: userTool.status || ToolStatus.INTERESTED,
    notes: {
      whatItDoes: notes.whatItDoes || '',
      whenToUse: notes.whenToUse || '',
      howToUse: notes.howToUse || '',
      gotchas: notes.gotchas || '',
      links: notes.links || ''
    },
    createdAt: userTool.createdAt,
    updatedAt: userTool.updatedAt,
    overrides: userTool.overrides
  };
};



const globalToTool = (globalTool: GlobalTool): Tool => {
  const now = Date.now();
  return {
    id: globalTool.toolId,
    name: globalTool.name,
    url: globalTool.websiteUrl || globalTool.canonicalUrl || '',
    logoUrl: globalTool.logoUrl || '',
    summary: globalTool.summary || '',
    bestUseCases: globalTool.bestUseCases || [],
    category: normalizeCategory(globalTool.category || 'Productivity'),
    tags: globalTool.tags || [],
    integrations: globalTool.integrations || [],
    pricingBucket: globalTool.pricingBucket || PricingBucket.UNKNOWN,
    pricingNotes: globalTool.pricingNotes || '',
    status: ToolStatus.INTERESTED,
    notes: { ...EMPTY_NOTES },
    createdAt: now,
    updatedAt: now,
  };
};

const getStatusStyles = (status?: ToolStatus) => {
  switch (status) {
    case ToolStatus.USING:
      return 'bg-primary/20 text-primary border-primary/20 shadow-[0_0_10px_-3px_rgba(236,72,153,0.3)]';
    case ToolStatus.TESTING:
      return 'bg-purple-500/20 text-purple-300 border-purple-500/20';
    case ToolStatus.NOT_USING:
      return 'bg-zinc-800 text-zinc-500 border-zinc-700';
    case ToolStatus.INTERESTED:
    default:
      return 'bg-blue-500/20 text-blue-300 border-blue-500/20';
  }
};


const LOGO_OVERRIDES: Record<string, string> = {
  'firebase.google.com': 'https://cdn.simpleicons.org/firebase',
  'analytics.google.com': 'https://cdn.simpleicons.org/googleanalytics',
  'lookerstudio.google.com': 'https://cdn.simpleicons.org/looker',
  'aistudio.google.com': 'https://cdn.simpleicons.org/googlegemini',
};

const getLogoOverride = (hostname: string) => {
  const lower = hostname.toLowerCase();
  if (LOGO_OVERRIDES[lower]) return LOGO_OVERRIDES[lower];
  return null;
};

const ToolIcon = ({ url, websiteUrl, name, className = "" }: { url?: string, websiteUrl?: string, name: string, className?: string }) => {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    setIsError(false);
    if (url) {
      setImgSrc(url);
    } else if (websiteUrl) {
      try {
        const domain = new URL(websiteUrl).hostname;
        const override = getLogoOverride(domain);
        if (override) {
          setImgSrc(override);
          return;
        }
        const logoToken = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;
        if (logoToken) {
          setImgSrc(`https://img.logo.dev/${domain}?token=${logoToken}`);
        } else {
          setImgSrc(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
        }
      } catch {
        setImgSrc(null);
      }
    } else {
      setImgSrc(null);
    }
  }, [url, websiteUrl]);

  const handleError = () => {
    if (imgSrc === url && websiteUrl && !isError) {
       try {
        const domain = new URL(websiteUrl).hostname;
        const override = getLogoOverride(domain);
        if (override) {
          setImgSrc(override);
          return;
        }
        const logoToken = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;
        if (logoToken) {
          setImgSrc(`https://img.logo.dev/${domain}?token=${logoToken}`);
          return;
        }
        setImgSrc(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
       } catch {
        setIsError(true);
       }
    } else if (websiteUrl && !isError) {
      try {
        const domain = new URL(websiteUrl).hostname;
        const override = getLogoOverride(domain);
        if (override) {
          setImgSrc(override);
          return;
        }
        setImgSrc(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
      } catch {
        setIsError(true);
      }
    } else {
      setIsError(true);
    }
  };

  if (imgSrc && !isError) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img 
          src={imgSrc} 
          alt={`${name} logo`} 
          className={`object-cover w-full h-full ${className}`} 
          onError={handleError} 
        />
      </>
    );
  }

  return (
    <div className={`flex items-center justify-center w-full h-full bg-surface text-gray-500 font-bold ${className}`}>
      {name ? name.substring(0, 2).toUpperCase() : '?'}
    </div>
  );
};

// 1. Sidebar Component
const Sidebar = ({ 
  categories, 
  activeCategory, 
  onCategorySelect,
  onExport,
  onImport,
  isOpen,
  onClose,
  onOpenSettings,
  onOpenAccountSettings,
  userDisplayName
}: { 
  categories: string[], 
  activeCategory: string, 
  onCategorySelect: (c: string) => void,
  onExport: () => void,
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void,
  isOpen: boolean,
  onClose: () => void,
  onOpenSettings: () => void,
  onOpenAccountSettings: () => void,
  userDisplayName?: string
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  const getIcon = (cat: string) => {
    const l = cat.toLowerCase();
    if (l.includes('ai')) return <Cpu size={18} />;
    if (l.includes('automation')) return <Zap size={18} />;
    if (l.includes('analytics')) return <BarChart2 size={18} />;
    if (l.includes('backend') || l.includes('infrastructure')) return <Database size={18} />;
    if (l.includes('crm')) return <Users size={18} />;
    if (l.includes('design')) return <PenTool size={18} />;
    if (l.includes('development') || l.includes('dev tools')) return <Code size={18} />;
    if (l.includes('notes') || l.includes('knowledge')) return <FileText size={18} />;
    if (l.includes('form')) return <ClipboardList size={18} />;
    if (l.includes('productivity')) return <CalendarClock size={18} />;
    return <Hash size={18} />;
  };

  return (
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-30 lg:hidden animate-fade-in-up" 
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed top-0 bottom-0 left-0 z-40 w-64 bg-black border-r border-border flex flex-col 
        transition-transform duration-300 ease-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} 
        lg:translate-x-0
      `}>
        <div className="p-6 relative flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://gnominion-tool-vault.vercel.app/toolvaultlogo.png" alt="Tool Vault logo" className="w-full h-full object-cover" />
            </div>
            <h1 className="font-bold text-xl tracking-tight text-white select-none">Tool Vault</h1>
          </div>
          
          <button 
            onClick={onClose} 
            className="absolute top-6 right-4 lg:hidden text-secondary hover:text-white p-2"
          >
            <X size={20} />
          </button>

          <nav className="space-y-1 overflow-y-auto max-h-full custom-scrollbar flex-1">
            <button 
              onClick={() => { onCategorySelect('All'); onClose(); }}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-full text-sm font-medium transition-all duration-200 ${activeCategory === 'All' ? 'bg-surface text-primary border border-border' : 'text-secondary hover:text-white hover:bg-surface/50'}`}
            >
              <LayoutGrid size={18} />
              All Tools
            </button>
            
            <div className="pt-6 pb-3 px-3 flex items-center justify-between">
              <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest select-none">Categories</span>
              <button onClick={onOpenSettings} className="text-secondary hover:text-primary transition-colors p-1" title="Manage Categories">
                <Settings size={14} />
              </button>
            </div>
            
            {categories.map(cat => (
              <button 
                key={cat}
                onClick={() => { onCategorySelect(cat); onClose(); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${activeCategory === cat ? 'bg-surface text-primary border border-border' : 'text-secondary hover:text-white hover:bg-surface/50'}`}
              >
                {getIcon(cat)}
                <span className="truncate">{cat}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* User Profile / Auth Section */}
        <div className="p-4 border-t border-border bg-black/50">
           {user ? (
             <>
               <div className="flex items-center gap-3 p-2 rounded-lg bg-surface border border-border/50 mb-3 w-full">
                 <button
                   type="button"
                   onClick={onOpenAccountSettings}
                   className="flex items-center gap-3 flex-1 min-w-0 text-left hover:border-primary/40 transition-colors"
                   aria-label="Open Account Settings"
                 >
                   {user.photoURL ? (
                     <>
                       {/* eslint-disable-next-line @next/next/no-img-element */}
                       <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full border border-border" />
                     </>
                   ) : (
                     <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                       <UserIcon size={14} />
                     </div>
                   )}
                   <div className="flex-1 min-w-0">
                     <p className="text-xs font-bold text-white truncate">{userDisplayName || user.displayName || 'User'}</p>
                     <p className="text-[10px] text-gray-500 truncate">{user.email}</p>
                   </div>
                 </button>
                 <button
                   onClick={logOut}
                   className="text-gray-500 hover:text-red-400 transition-colors p-2"
                   title="Sign Out"
                 >
                   <LogOut size={16} />
                 </button>
               </div>
             </>
           ) : null}

          <div className="flex gap-2">
             <button 
              onClick={onExport}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg bg-surface border border-border text-xs font-medium text-secondary hover:text-white hover:border-gray-500 transition-all hover:bg-surfaceHover"
              title="Export Data"
            >
              <Download size={14} /> 
            </button>
             <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg bg-surface border border-border text-xs font-medium text-secondary hover:text-white hover:border-gray-500 transition-all hover:bg-surfaceHover"
              title="Import JSON"
            >
              <Upload size={14} /> 
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".json" 
              onChange={onImport}
            />
          </div>
        </div>
      </aside>
    </>
  );
};

// 2. Login Modal
const LoginModal = ({ 
  isOpen
}: { 
  isOpen: boolean
}) => {
  const [error, setError] = useState('');
  const [auth0Loading, setAuth0Loading] = useState(false);

  const handleAuth0Login = async () => {
    setAuth0Loading(true);
    setError('');
    try {
      await signInWithAuth0();
    } catch (err: any) {
      console.error("Auth0 Login Error:", err);
      setError(err?.message || 'Failed to sign in.');
      setAuth0Loading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-2xl p-8 max-w-sm w-full shadow-2xl animate-fade-in-up relative overflow-hidden">
        {/* Decorative Glow */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>
        
        <div className="flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-2xl overflow-hidden mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://gnominion-tool-vault.vercel.app/toolvaultlogo.png" alt="Tool Vault logo" className="w-full h-full object-cover" />
          </div>
          
          <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">Access Your Vault</h3>
          <p className="text-secondary text-sm mb-8 leading-relaxed">
            Sign in to sync your tools across devices and secure your knowledge base in the cloud.
          </p>

          {error && (
            <div className="w-full mb-4 p-3 bg-red-900/20 border border-red-900/50 rounded-lg text-red-200 text-xs">
              {error}
            </div>
          )}

          <button 
            onClick={handleAuth0Login}
            disabled={auth0Loading}
            className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-full bg-white text-black font-bold hover:bg-gray-100 transition-colors shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
          >
             {auth0Loading ? (
                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
             ) : (
                <UserIcon size={18} />
             )}
            <span>Sign in</span>
          </button>
        </div>
      </div>
    </div>
  );
};
const ProfileSetupModal = ({
  isOpen,
  email,
  initialProfile,
  displayName,
  onSave,
  onSkip
}: {
  isOpen: boolean;
  email: string;
  initialProfile: UserProfile | null;
  displayName?: string;
  onSave: (profile: UserProfile) => void;
  onSkip: () => void;
}) => {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [industry, setIndustry] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setName(initialProfile?.name || displayName || '');
    setCompany(initialProfile?.company || '');
    setIndustry(initialProfile?.industry || '');
    setError('');
  }, [isOpen, initialProfile, displayName]);

  const handleSave = async () => {
    try {
      const trimmedName = name.trim();
      await onSave({
        name: trimmedName || undefined,
        company: company.trim() || undefined,
        industry: industry.trim() || undefined,
        email
      });
    } catch (err) {
      console.error('Failed to save profile', err);
      setError('Could not save your profile. Please try again.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-2xl p-8 max-w-md w-full shadow-2xl animate-fade-in-up relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>

        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">Tell us about your work</h3>
            <p className="text-secondary text-sm">Optional details to personalize your vault.</p>
          </div>

          {error && (
            <div className="w-full p-3 bg-red-900/20 border border-red-900/50 rounded-lg text-red-200 text-xs">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-secondary uppercase tracking-wider mb-2">Display Name (optional)</label>
              <input
                className="w-full bg-black border border-border rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none transition-colors text-base md:text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Display name"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-secondary uppercase tracking-wider mb-2">Company (optional)</label>
              <input
                className="w-full bg-black border border-border rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none transition-colors text-base md:text-sm"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Company"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-secondary uppercase tracking-wider mb-2">Industry (optional)</label>
              <select
                className="w-full bg-black border border-border rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none transition-colors text-base md:text-sm"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              >
                <option value="">Select industry</option>
                {INDUSTRY_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>

          <p className="text-[11px] text-gray-500">You can change or add this information in the settings at any time.</p>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onSkip}
              className="text-xs text-secondary hover:text-white transition-colors"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-6 py-2.5 rounded-full text-sm font-bold bg-primary text-white hover:bg-primaryHover transition-all shadow-lg"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const AccountSettingsModal = ({
  isOpen,
  email,
  profile,
  onSave,
  onClear,
  onClose
}: {
  isOpen: boolean;
  email: string;
  profile: UserProfile | null;
  onSave: (profile: UserProfile) => void;
  onClear: () => void;
  onClose: () => void;
}) => {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [industry, setIndustry] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setName(profile?.name || '');
    setCompany(profile?.company || '');
    setIndustry(profile?.industry || '');
    setError('');
  }, [isOpen, profile]);

  const handleSave = async () => {
    try {
      const trimmedName = name.trim();
      await onSave({
        name: trimmedName || undefined,
        company: company.trim() || undefined,
        industry: industry.trim() || undefined,
        email
      });
    } catch (err) {
      console.error('Failed to save profile', err);
      setError('Could not save your profile. Please try again.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-2xl p-8 max-w-md w-full shadow-2xl animate-fade-in-up relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>

        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">Account Settings</h3>
              <p className="text-secondary text-sm">Manage your account profile details.</p>
            </div>
            <button onClick={onClose} className="text-secondary hover:text-white"><X size={18} /></button>
          </div>

          {error && (
            <div className="w-full p-3 bg-red-900/20 border border-red-900/50 rounded-lg text-red-200 text-xs">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-secondary uppercase tracking-wider mb-2">Display Name *</label>
              <input
                className="w-full bg-black border border-border rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none transition-colors text-base md:text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Display name"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-secondary uppercase tracking-wider mb-2">Company (optional)</label>
              <input
                className="w-full bg-black border border-border rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none transition-colors text-base md:text-sm"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Company"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-secondary uppercase tracking-wider mb-2">Industry (optional)</label>
              <select
                className="w-full bg-black border border-border rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none transition-colors text-base md:text-sm"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              >
                <option value="">Select industry</option>
                {INDUSTRY_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-secondary uppercase tracking-wider mb-2">Email</label>
              <input
                className="w-full bg-black border border-border rounded-lg px-4 py-3 text-white/70 focus:outline-none text-base md:text-sm"
                value={email}
                disabled
              />
            </div>
          </div>

          <div className="flex items-center justify-between mt-2">
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-red-300 hover:text-red-200 transition-colors"
            >
              Clear profile info
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-6 py-2.5 rounded-full text-sm font-bold bg-primary text-white hover:bg-primaryHover transition-all shadow-lg"
            >
              Save changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const SettingsModal = ({
  isOpen,
  onClose,
  categories,
  onUpdateCategories,
  onOpenAccountSettings
}: {
  isOpen: boolean,
  onClose: () => void,
  categories: string[],
  onUpdateCategories: (newCats: string[]) => void,
  onOpenAccountSettings: () => void
}) => {
  const [newCat, setNewCat] = useState('');
  const defaultCategoryLookup = new Set(DEFAULT_CATEGORIES.map((cat) => cat.toLowerCase()));

  const addCategory = () => {
    const normalized = normalizeCategory(newCat);
    if (normalized && !categories.includes(normalized)) {
      onUpdateCategories([...categories, normalized].sort());
      setNewCat('');
    }
  };

  const removeCategory = (cat: string) => {
    onUpdateCategories(categories.filter(c => c !== cat));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl shadow-pink-500/10 flex flex-col max-h-[85vh]">
        <div className="flex justify-between items-center p-6 border-b border-border">
          <h2 className="text-xl font-bold text-white">Manage Categories</h2>
          <button onClick={onClose} className="text-secondary hover:text-white"><X size={20} /></button>
        </div>
        
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
            <div className="space-y-4">
              <button
                type="button"
                onClick={onOpenAccountSettings}
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-black border border-border text-sm text-secondary hover:text-white hover:border-gray-500 transition-all"
              >
                <span className="font-semibold">Account Settings</span>
                <ArrowUpRight size={16} />
              </button>
               <div className="flex gap-2">
                 <input 
                   type="text"
                   className="flex-1 bg-black border border-border rounded-lg px-4 py-2 text-white text-base md:text-sm focus:border-primary focus:outline-none"
                   placeholder="New category name..."
                   value={newCat}
                   maxLength={MAX_CATEGORY_LENGTH}
                   onChange={e => setNewCat(e.target.value.slice(0, MAX_CATEGORY_LENGTH))}
                   onKeyDown={e => e.key === 'Enter' && addCategory()}
                 />
                 <button onClick={addCategory} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primaryHover">
                   <Plus size={18} />
                 </button>
               </div>
               
               <div className="grid grid-cols-2 gap-2">
                 {categories.map(cat => (
                   <div key={cat} className="flex items-center gap-2 p-3 bg-black border border-border rounded-lg">
                      <span className="text-sm text-gray-300 truncate flex-1 min-w-0" title={cat}>{cat}</span>
                      {defaultCategoryLookup.has(cat.toLowerCase()) ? (
                        <span className="text-[10px] text-gray-500 border border-border rounded-full px-2 py-0.5">Default</span>
                      ) : (
                        <button className="ml-3 shrink-0 " onClick={() => removeCategory(cat)} className="text-gray-600 hover:text-red-500 transition-colors shrink-0" title="Delete category">
                          <Trash2 size={14} />
                        </button>
                      )}
                   </div>
                 ))}
               </div>
               <p className="text-[10px] text-gray-500 mt-4">
                 Note: Deleting a category will not delete the tools in it; tools will fall back to your default category.
               </p>
            </div>
        </div>
      </div>
    </div>
  );
};

const getEnrichmentNoticeFromError = (message: string) => {
  if (message.includes('Too many requests')) {
    return {
      title: 'Minute Limit Reached',
      message: 'Minute Limit Reached. You can try again in 60 seconds.'
    };
  }
  if (message.includes('Daily limit reached')) {
    return {
      title: 'Daily Limit Reached',
      message: 'Daily Limit Reached. You can try again in 24 hours.'
    };
  }
  if (message.includes('Authentication required')) {
    return {
      title: 'Sign In Required',
      message: 'Sign in to use AI enrichment.'
    };
  }

  return null;
};

const AddToolModal = ({ 
  isOpen, 
  onClose, 
  onSave,
  categories,
  onNotice,
  onUpdateCategories
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSave: (tool: Tool) => void,
  categories: string[],
  onNotice: (notice: { title: string; message: string }) => void,
  onUpdateCategories: (newCats: string[]) => void
}) => {
  const { user } = useAuth();
  const [step, setStep] = useState<'chat' | 'enriching' | 'review'>('chat');
  const [input, setInput] = useState('');
  const [draftTool, setDraftTool] = useState<Partial<Tool>>({});
  const [newTag, setNewTag] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [customCategoryOpen, setCustomCategoryOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep('chat');
      setInput('');
      setDraftTool({});
      setNewTag('');
      setCustomCategory('');
      setCustomCategoryOpen(false);
    }
  }, [isOpen]);

  const updateDraftOverride = (field: keyof Tool, value: any, overrideKey?: string) => {
    setDraftTool((prev) => ({
      ...prev,
      [field]: value,
      overrides: {
        ...(prev.overrides || {}),
        [(overrideKey || field) as string]: value
      }
    }));
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    if (!user) {
      const now = Date.now();
      const isUrl = input.trim().startsWith('http');
      setDraftTool({
        id: crypto.randomUUID(),
        name: input.trim(),
        url: isUrl ? input.trim() : '',
        summary: '',
        bestUseCases: [],
        category: categories[0],
        tags: [],
        integrations: [],
        pricingBucket: PricingBucket.UNKNOWN,
        pricingNotes: '',
        status: ToolStatus.INTERESTED,
        notes: {
          whatItDoes: '',
          whenToUse: '',
          howToUse: '',
          gotchas: '',
          links: ''
        },
        createdAt: now,
        updatedAt: now
      });
      setStep('review');
      return;
    }

    setStep('enriching');
    
    try {
      const enriched = await enrichToolData(input, categories);
      let finalUrl = enriched.websiteUrl || enriched.canonicalUrl || '';
      if (!finalUrl && input.trim().startsWith('http')) {
        finalUrl = input.trim();
      }
      
      const now = Date.now();
      setDraftTool({
        id: enriched.toolId,
        name: enriched.name,
        url: finalUrl,
        logoUrl: enriched.logoUrl || '',
        summary: enriched.summary,
        bestUseCases: enriched.bestUseCases || [],
        category: enriched.category || categories[0],
        tags: enriched.tags || [],
        integrations: enriched.integrations || [],
        pricingBucket: enriched.pricingBucket || PricingBucket.UNKNOWN,
        pricingNotes: enriched.pricingNotes || '',
        status: ToolStatus.INTERESTED, // Default status for new tools
        notes: {
          whatItDoes: enriched.whatItDoes || '',
          whenToUse: '',
          howToUse: '',
          gotchas: '',
          links: ''
        },
        createdAt: now,
        updatedAt: now
      });

      setStep('review');
    } catch (error: any) {
      console.error("Enrichment failed", error);
      const notice = error?.message ? getEnrichmentNoticeFromError(error.message) : null;
      if (notice) {
        onClose();
        onNotice(notice);
        return;
      }

      if (user) {
        onClose();
        onNotice({
          title: 'Enrichment unavailable',
          message: 'This tool could not be enriched. Try again later.'
        });
        return;
      }

      setStep('review');
      setDraftTool({
        name: input,
        category: categories[0],
        pricingBucket: PricingBucket.UNKNOWN,
        status: ToolStatus.INTERESTED,
        tags: []
      });
    }
  };

  const handleSave = () => {
    if (!draftTool.name) return;
    if (user && !draftTool.id) {
      onNotice({
        title: 'Enrichment required',
        message: 'Unable to save without global tool metadata.'
      });
      return;
    }
    const normalizedCategory = normalizeCategory(draftTool.category || categories[0] || 'Productivity');
    if (normalizedCategory && !categories.includes(normalizedCategory)) {
      onUpdateCategories(mergeWithDefaultCategories([...categories, normalizedCategory]));
    }
    const nextTool = { ...draftTool, category: normalizedCategory };
    onSave(nextTool as Tool);
    onClose();
  };

  const addTag = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTag.trim()) {
      e.preventDefault();
      const currentTags = draftTool.tags || [];
      if (!currentTags.includes(newTag.trim())) {
        setDraftTool({ ...draftTool, tags: [...currentTags, newTag.trim()] });
      }
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    const currentTags = draftTool.tags || [];
    setDraftTool({ ...draftTool, tags: currentTags.filter(t => t !== tagToRemove) });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl shadow-pink-500/10 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-6 border-b border-border">
          <h2 className="text-xl font-bold text-white tracking-tight">Add New Tool</h2>
          <button onClick={onClose} className="text-secondary hover:text-white transition-colors"><X size={20} /></button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {step === 'chat' && (
            <div className="flex flex-col items-center justify-center h-64 space-y-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-2 shadow-inner shadow-primary/20">
                <Plus size={32} className="text-primary" />
              </div>
              <p className="text-center text-secondary max-w-md font-light">
                Enter a URL or tool name. I&apos;ll search for details and set up the card for you.
              </p>
              <form onSubmit={handleChatSubmit} className="w-full max-w-md relative group">
                <input
                  autoFocus
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="e.g. https://www.jasper.ai or 'Zapier'"
                  className="w-full bg-black border border-border rounded-full px-6 py-4 pr-14 text-white placeholder-gray-600 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all text-base"
                />
                <button 
                  type="submit"
                  disabled={!input.trim()}
                  className="absolute right-2 top-2 p-2 bg-primary text-white rounded-full hover:bg-primaryHover disabled:opacity-50 disabled:hover:bg-primary transition-all shadow-lg shadow-primary/20"
                >
                  <ArrowUpRight size={20} />
                </button>
              </form>
            </div>
          )}

          {step === 'enriching' && (
            <div className="flex flex-col items-center justify-center h-64 space-y-5">
              <div className="relative">
                 <div className="w-12 h-12 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                 <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                 </div>
              </div>
              <p className="text-secondary animate-pulse font-medium">Analyzing tool data...</p>
            </div>
          )}

          {step === 'review' && draftTool && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="space-y-4">
                    <label className="block text-xs font-bold text-secondary uppercase tracking-wider">Name</label>
                    <input 
                      className="w-full bg-black border border-border rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none transition-colors text-base md:text-sm"
                      value={draftTool.name || ''}
                      onChange={e => updateDraftOverride('name', e.target.value)}
                    />
                 </div>
                 <div className="space-y-4">
                    <label className="block text-xs font-bold text-secondary uppercase tracking-wider">URL</label>
                    <input 
                      className="w-full bg-black border border-border rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none transition-colors text-base md:text-sm"
                      value={draftTool.url || ''}
                      onChange={e => updateDraftOverride('url', e.target.value, 'websiteUrl')}
                    />
                 </div>
                 <div className="space-y-4">
                    <label className="block text-xs font-bold text-secondary uppercase tracking-wider">Status</label>
                    <select 
                      className="w-full bg-black border border-border rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none transition-colors text-base md:text-sm"
                      value={draftTool.status || ToolStatus.INTERESTED}
                      onChange={e => setDraftTool({...draftTool, status: e.target.value as ToolStatus})}
                    >
                      {Object.values(ToolStatus).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                 </div>
                 <div className="space-y-4">
                    <label className="block text-xs font-bold text-secondary uppercase tracking-wider">Pricing</label>
                    <select 
                      className="w-full bg-black border border-border rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none transition-colors text-base md:text-sm"
                      value={draftTool.pricingBucket || PricingBucket.UNKNOWN}
                      onChange={e => updateDraftOverride('pricingBucket', e.target.value as PricingBucket)}
                    >
                      {Object.values(PricingBucket).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                 </div>
                 <div className="col-span-1 md:col-span-2 space-y-4">
                    <label className="block text-xs font-bold text-secondary uppercase tracking-wider">Summary</label>
                    <input 
                      className="w-full bg-black border border-border rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none transition-colors text-base md:text-sm"
                      value={draftTool.summary || ''}
                      onChange={e => updateDraftOverride('summary', e.target.value)}
                    />
                 </div>
                 <div className="space-y-4">
                    <label className="block text-xs font-bold text-secondary uppercase tracking-wider">Category</label>
                    <select 
                      className="w-full bg-black border border-border rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none transition-colors text-base md:text-sm"
                      value={(draftTool.category && !categories.includes(draftTool.category)) ? '__custom__' : (draftTool.category || categories[0] || '')}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '__custom__') {
                          setCustomCategory('');
                          setCustomCategoryOpen(true);
                          setDraftTool({ ...draftTool, category: '' });
                          return;
                        }
                        setCustomCategory('');
                        setCustomCategoryOpen(false);
                        setDraftTool({ ...draftTool, category: value });
                      }}
                    >
                      {(draftTool.category || categories[0]) ? null : <option value="" disabled>Select a category</option>}
                      {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      <option value="__custom__">Add New...</option>
                    </select>
                    {customCategoryOpen || (draftTool.category && !categories.includes(draftTool.category)) || customCategory !== '' ? (
                      <input 
                        className="w-full bg-black border border-border rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none transition-colors text-base md:text-sm"
                        placeholder="New category name..."
                        value={(draftTool.category && !categories.includes(draftTool.category)) ? draftTool.category : customCategory}
                        maxLength={MAX_CATEGORY_LENGTH}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setCustomCategory(raw);
                          setDraftTool({ ...draftTool, category: normalizeCategory(raw) });
                        }}
                      />
                    ) : null}
                 </div>
              </div>
              <div className="bg-black/30 p-4 rounded-xl border border-border/50">
                <p className="text-xs text-secondary mb-3 font-bold uppercase tracking-wider">Tags</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {draftTool.tags?.map((tag, i) => (
                    <span key={i} className="flex items-center gap-1 px-3 py-1 bg-surface border border-border rounded-full text-xs text-gray-300 font-medium">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="hover:text-white"><X size={10} /></button>
                    </span>
                  ))}
                </div>
                <input 
                  className="bg-transparent border-b border-border text-base md:text-sm text-white focus:border-primary focus:outline-none w-full py-2"
                  placeholder="Type tag and press Enter..."
                  value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  onKeyDown={addTag}
                />
              </div>
            </div>
          )}
        </div>

        {step === 'review' && (
          <div className="p-6 border-t border-border flex justify-end gap-3 bg-surface">
            <button 
              onClick={() => setStep('chat')}
              className="px-6 py-2.5 rounded-full text-sm font-medium text-secondary hover:text-white hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave}
              className="px-8 py-2.5 bg-primary text-white font-bold rounded-full hover:bg-primaryHover transition-all shadow-lg shadow-primary/25 flex items-center gap-2"
            >
              <Save size={16} /> Save to Vault
            </button>
          </div>
        )}
      </div>

    </div>
  );
};


const NoteSection = ({
  title,
  value,
  field,
  onChange,
  onBlur,
  showEdit,
  isEditing,
  onRequestEdit
}: {
  title: string;
  value: string;
  field: keyof Tool['notes'];
  onChange: (field: keyof Tool['notes'], value: string) => void;
  onBlur: (field: keyof Tool['notes'], value: string) => void;
  showEdit?: boolean;
  isEditing?: boolean;
  onRequestEdit?: (field: keyof Tool['notes']) => void;
}) => (
  <div className="mb-10 group">
    <h3 className="text-xs font-bold text-secondary uppercase tracking-widest mb-4 flex items-center justify-between gap-2 border-b border-border/50 pb-2">
      <span>{title}</span>
      {showEdit && (
        <button
          type="button"
          onClick={() => onRequestEdit?.(field)}
          className="p-1.5 rounded-full bg-black border border-border text-secondary hover:text-white hover:border-gray-500 transition-all"
          title="Edit note"
        >
          <Pencil size={12} />
        </button>
      )}
    </h3>
    <textarea
      id={`note-${field}`}
      className="w-full min-h-[120px] bg-black border border-border rounded-xl p-4 text-gray-300 leading-relaxed focus:border-primary focus:outline-none transition-colors resize-none font-mono text-base md:text-sm"
      value={value}
      onChange={(e) => onChange(field, e.target.value)}
      onBlur={(e) => onBlur(field, e.target.value)}
      readOnly={showEdit && !isEditing}
      placeholder="Supports Markdown (e.g. **bold**, [link](url), - list)"
    />
    <p className="text-[10px] text-gray-600 mt-1 flex justify-end">Markdown Supported</p>
  </div>
);

const ToolDetail = ({ 
  tool, 
  onClose, 
  onUpdate,
  onRequestDelete,
  categories,
  isAdmin,
  onAddToCatalog,
  onTagSelect
}: { 
  tool: Tool, 
  onClose: () => void, 
  onUpdate: (t: Tool) => Promise<void>, 
  onRequestDelete: (id: string) => void,
  categories: string[],
  isAdmin: boolean,
  onAddToCatalog: (toolId: string) => void,
  onTagSelect: (tag: string) => void
}) => {
  const [adminMode, setAdminMode] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState(EMPTY_NOTES);
  const [editingNoteField, setEditingNoteField] = useState<keyof Tool['notes'] | null>(null);
  const [showLogoPreview, setShowLogoPreview] = useState(false);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [editedTool, setEditedTool] = useState<Tool>(tool);
  const [newTag, setNewTag] = useState('');
  const [editingField, setEditingField] = useState<null | 'pricing' | 'bestUseCases'>(null);
  const [headerEditing, setHeaderEditing] = useState(false);
  const [fieldDrafts, setFieldDrafts] = useState({
    name: tool.name || '',
    summary: tool.summary || '',
    pricingBucket: tool.pricingBucket || PricingBucket.UNKNOWN,
    pricingNotes: tool.pricingNotes || '',
    bestUseCases: (tool.bestUseCases || []).map((item) => `- ${item}`).join('\n'),
    url: tool.url || ''
  });
  const lastToolIdRef = useRef<string | null>(null);
  const canEditGlobal = isAdmin && adminMode;

  useEffect(() => {
    if (!categories.length) return;
    if (editedTool.category && !categories.includes(editedTool.category)) {
      setEditedTool((prev) => ({ ...prev, category: categories[0] || 'Productivity' }));
    }
  }, [categories, editedTool.category]);

  useEffect(() => {
    const normalizedNotes = { ...EMPTY_NOTES, ...(tool.notes || {}) };
    lastToolIdRef.current = tool.id;
    setEditedTool({ ...tool, notes: normalizedNotes });
    setNoteDrafts(normalizedNotes);
    setFieldDrafts({
      name: tool.name || '',
      summary: tool.summary || '',
      pricingBucket: tool.pricingBucket || PricingBucket.UNKNOWN,
      pricingNotes: tool.pricingNotes || '',
      bestUseCases: (tool.bestUseCases || []).map((item) => `- ${item}`).join('\n'),
      url: tool.url || ''
    });
    setHeaderEditing(false);
    if (tool.category && !categories.includes(tool.category)) {
      setEditedTool((prev) => ({ ...prev, category: categories[0] || 'Productivity' }));
    }
  }, [tool, categories]);


  const updateEditedTool = (updater: (prev: Tool) => Tool) => {
    setEditedTool((prev) => {
      const next = updater(prev);
      return next;
    });
  };

  const updateNotes = (field: keyof Tool['notes'], value: string) => {
    setNoteDrafts((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const saveNote = async (field: keyof Tool['notes'], value: string) => {
    const nextNotes = { ...noteDrafts, [field]: value };
    const nextTool = { ...editedTool, notes: { ...EMPTY_NOTES, ...nextNotes }, updatedAt: Date.now() };
    setEditedTool(nextTool);
    try {
      await onUpdate(nextTool);
    } catch (err) {
      console.error('Failed to save note', err);
    } finally {
      if (editingNoteField == field) {
        setEditingNoteField(null);
      }
    }
  };

  const applyFieldUpdate = (field: keyof Tool, value: any, overrideKey?: string) => {
    let nextTool: Tool;
    if (canEditGlobal) {
      nextTool = { ...editedTool, [field]: value };
    } else {
      nextTool = {
        ...editedTool,
        [field]: value,
        overrides: {
          ...(editedTool.overrides || {}),
          [(overrideKey || field) as string]: value
        }
      };
    }
    setEditedTool(nextTool);
    return nextTool;
  };

  const saveField = async (field: 'name' | 'summary' | 'pricing' | 'bestUseCases' | 'url') => {
    let nextTool = editedTool;
    let globalPayload: Record<string, unknown> | null = null;

    if (field == 'name') {
      const value = fieldDrafts.name.trim();
      nextTool = applyFieldUpdate('name', value);
      globalPayload = { name: value };
    }

    if (field == 'summary') {
      const value = fieldDrafts.summary.trim();
      nextTool = applyFieldUpdate('summary', value);
      globalPayload = { summary: value };
    }

    if (field == 'pricing') {
      nextTool = applyFieldUpdate('pricingBucket', fieldDrafts.pricingBucket);
      nextTool = applyFieldUpdate('pricingNotes', fieldDrafts.pricingNotes.trim());
      globalPayload = { pricingBucket: fieldDrafts.pricingBucket, pricingNotes: fieldDrafts.pricingNotes.trim() };
    }

    if (field == 'bestUseCases') {
      const list = fieldDrafts.bestUseCases
        .split('\n')
        .map((item) => item.replace(/^[-*]\s*/, '').trim())
        .filter(Boolean);
      nextTool = applyFieldUpdate('bestUseCases', list);
      globalPayload = { bestUseCases: list };
    }

    if (field == 'url') {
      const value = fieldDrafts.url?.trim() || '';
      nextTool = applyFieldUpdate('url', value, 'websiteUrl');
      globalPayload = { websiteUrl: value };
    }

    try {
      await onUpdate(nextTool);
      if (isAdmin && adminMode && globalPayload) {
        await updateGlobalTool(editedTool.id, globalPayload);
      }
    } catch (err) {
      console.error('Failed to save field', err);
    } finally {
      setEditingField(null);
    }
  };


  const saveHeader = async () => {
    const name = fieldDrafts.name.trim();
    const summary = fieldDrafts.summary.trim();
    const url = fieldDrafts.url?.trim() || '';
    let nextTool = editedTool;

    nextTool = applyFieldUpdate('name', name);
    nextTool = applyFieldUpdate('summary', summary);
    nextTool = applyFieldUpdate('url', url, 'websiteUrl');

    try {
      await onUpdate(nextTool);
      if (isAdmin && adminMode) {
        await updateGlobalTool(editedTool.id, { name, summary, websiteUrl: url });
      }
    } catch (err) {
      console.error('Failed to save header info', err);
    } finally {
      setHeaderEditing(false);
    }
  };
  const handleCategoryChange = async (value: string) => {
    const nextTool = { ...editedTool, category: value, updatedAt: Date.now() };
    setEditedTool(nextTool);
    try {
      await onUpdate(nextTool);
    } catch (err) {
      console.error('Failed to update category', err);
    }
  };

  const handleStatusChange = async (value: ToolStatus) => {
    const nextTool = { ...editedTool, status: value, updatedAt: Date.now() };
    setEditedTool(nextTool);
    try {
      await onUpdate(nextTool);
    } catch (err) {
      console.error('Failed to update status', err);
    }
  };

  const getLogoDevUrl = (websiteUrl: string) => {
    try {
      const token = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;
      if (!token) return null;
      const domain = new URL(websiteUrl).hostname;
      return `https://img.logo.dev/${domain}?token=${token}`;
    } catch {
      return null;
    }
  };

  const openLogoPreview = () => {
    const url = getLogoDevUrl(editedTool.url);
    if (!url) {
      alert('Logo.dev token or valid website URL is missing.');
      return;
    }
    setLogoPreviewUrl(url);
    setShowLogoPreview(true);
  };

  const applyLogoPreview = () => {
    if (!logoPreviewUrl) return;
    setField('logoUrl', logoPreviewUrl);
    setShowLogoPreview(false);
  };

  const setField = (field: keyof Tool, value: any, overrideKey?: string) => {
    if (canEditGlobal) {
      updateEditedTool((prev) => ({ ...prev, [field]: value }));
      return;
    }

    updateEditedTool((prev) => ({
      ...prev,
      [field]: value,
      overrides: {
        ...(prev.overrides || {}),
        [(overrideKey || field) as string]: value
      }
    }));
  };

  const addTag = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTag.trim()) {
      e.preventDefault();
      const currentTags = editedTool.tags || [];
      if (!currentTags.includes(newTag.trim())) {
        const nextTool = { ...editedTool, tags: [...currentTags, newTag.trim()], updatedAt: Date.now() };
        setEditedTool(nextTool);
        try {
          await onUpdate(nextTool);
        } catch (err) {
          console.error('Failed to add tag', err);
        }
      }
      setNewTag('');
    }
  };

  const removeTag = async (tagToRemove: string) => {
    const nextTool = {
      ...editedTool,
      tags: editedTool.tags.filter((t) => t !== tagToRemove),
      updatedAt: Date.now()
    };
    setEditedTool(nextTool);
    try {
      await onUpdate(nextTool);
    } catch (err) {
      console.error('Failed to remove tag', err);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end pointer-events-none">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto transition-opacity duration-300" 
        onClick={onClose}
      />
      <div className="w-full md:max-w-3xl h-full bg-surface border-l border-border shadow-2xl overflow-hidden flex flex-col pointer-events-auto relative transform transition-transform duration-300 ease-out animate-slide-in-right">
        <div className="absolute top-6 right-4 md:right-6 flex items-center gap-2 z-10">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setAdminMode((prev) => !prev)}
              title={adminMode ? 'Admin edit mode' : 'Personal edit mode'}
              aria-pressed={adminMode}
              aria-label="Toggle admin edit mode"
              className="flex items-center gap-1 p-1 rounded-full bg-black/80 border border-border shadow-[0_0_18px_-10px_rgba(236,72,153,0.6)]"
            >
              <span
                className={`flex items-center justify-center w-7 h-7 rounded-full transition-all ${
                  adminMode
                    ? 'text-secondary'
                    : 'bg-primary/20 text-primary shadow-[0_0_10px_-2px_rgba(236,72,153,0.6)]'
                }`}
              >
                <UserIcon size={14} />
              </span>
              <span
                className={`flex items-center justify-center w-7 h-7 rounded-full transition-all ${
                  adminMode
                    ? 'bg-primary/20 text-primary shadow-[0_0_10px_-2px_rgba(236,72,153,0.6)]'
                    : 'text-secondary'
                }`}
              >
                <Settings size={14} />
              </span>
            </button>
          )}
          <button 
            onClick={() => onRequestDelete(tool.id)}
            className="p-2.5 rounded-full bg-black border border-border text-red-400 hover:text-red-300 hover:border-red-900/50 transition-all"
            title="Delete Tool"
          >
            <Trash2 size={18} />
          </button>
          <button 
            onClick={onClose}
            className="p-2.5 rounded-full bg-black border border-border text-secondary hover:text-white hover:border-gray-500 transition-all ml-2"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto h-full p-6 md:p-10 custom-scrollbar">
          <div className="mb-12 pr-24 md:pr-28">
            <div className="flex flex-col md:flex-row items-start gap-6 mb-8">
              <div className="w-24 h-24 rounded-2xl bg-black border border-border flex items-center justify-center shadow-lg overflow-hidden shrink-0 relative p-1">
                 <div className="w-full h-full rounded-xl overflow-hidden bg-surface">
                   <ToolIcon url={editedTool.logoUrl} websiteUrl={editedTool.url} name={editedTool.name} />
                 </div>
              </div>
              <div className="w-full pt-1">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 space-y-3">
                    {headerEditing ? (
                      <input
                        className="w-full text-3xl md:text-4xl font-bold text-white bg-transparent border-b border-border focus:border-primary focus:outline-none pb-2"
                        value={fieldDrafts.name}
                        onChange={(e) => setFieldDrafts({ ...fieldDrafts, name: e.target.value })}
                      />
                    ) : (
                      <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">{editedTool.name}</h1>
                    )}
                    <div className="flex flex-wrap items-center gap-3 text-xs md:text-sm">
                      <select
                        className="bg-black border border-border text-white rounded px-2 py-1 focus:border-primary focus:outline-none text-base md:text-sm"
                        value={categories.includes(editedTool.category) ? editedTool.category : (categories[0] || 'Productivity')}
                        onChange={(e) => handleCategoryChange(e.target.value)}
                      >
                        {categories.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>

                      <select
                        className="bg-black border border-border text-white rounded px-2 py-1 focus:border-primary focus:outline-none text-base md:text-sm"
                        value={editedTool.status || ToolStatus.INTERESTED}
                        onChange={(e) => handleStatusChange(e.target.value as ToolStatus)}
                      >
                        {Object.values(ToolStatus).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>

                      <span className="hidden md:inline w-1 h-1 rounded-full bg-gray-700 mx-1"></span>
                      {headerEditing ? (
                        <div className="flex items-center gap-2 w-full md:w-auto">
                          <input
                            className="min-w-[220px] bg-transparent text-secondary border-b border-border focus:border-primary focus:outline-none text-base md:text-sm"
                            value={fieldDrafts.url}
                            onChange={(e) => setFieldDrafts({ ...fieldDrafts, url: e.target.value })}
                            placeholder="https://"
                          />
                        </div>
                      ) : (
                        <a href={editedTool.url} target="_blank" rel="noopener noreferrer" className="text-secondary hover:text-white flex items-center gap-1.5 transition-colors group text-xs md:text-sm">
                          {editedTool.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                          <ArrowUpRight size={14} className="group-hover:text-primary transition-colors"/>
                        </a>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (headerEditing) {
                        saveHeader();
                        return;
                      }
                      setFieldDrafts({
                        ...fieldDrafts,
                        name: editedTool.name || '',
                        summary: editedTool.summary || '',
                        url: editedTool.url || ''
                      });
                      setHeaderEditing(true);
                    }}
                    className="px-3 py-1.5 rounded-full border border-border text-xs font-semibold tracking-wide uppercase text-secondary hover:text-white hover:border-gray-500 transition-all"
                    title={headerEditing ? 'Save tool info' : 'Edit tool info'}
                  >
                    {headerEditing ? 'Save' : 'Edit'}
                  </button>
                </div>

                <div className="mt-4 max-w-[65ch]">
                  {headerEditing ? (
                    <textarea
                      className="w-full bg-black border border-border rounded-lg p-4 text-lg md:text-xl text-gray-300 focus:border-primary focus:outline-none transition-colors"
                      value={fieldDrafts.summary}
                      onChange={(e) => setFieldDrafts({ ...fieldDrafts, summary: e.target.value })}
                    />
                  ) : (
                    <p className="text-lg md:text-xl text-gray-200 font-light leading-relaxed">
                      {editedTool.summary}
                    </p>
                  )}
                </div>

                {isAdmin && adminMode && (
                  <div className="mt-4">
                    <label className="block text-xs font-bold text-secondary uppercase tracking-wider mb-2">Logo URL</label>
                    <div className="flex flex-col gap-2">
                      <input
                        className="w-full bg-black border border-border rounded-lg px-3 py-2 text-white focus:border-primary focus:outline-none transition-colors text-base md:text-sm"
                        value={editedTool.logoUrl || ''}
                        onChange={(e) => setField('logoUrl', e.target.value)}
                        placeholder="https://..."
                      />
                      <button
                        type="button"
                        onClick={openLogoPreview}
                        className="self-start text-[11px] uppercase tracking-[0.2em] text-secondary hover:text-white transition-colors flex items-center gap-2"
                      >
                        <BookOpen size={14} className="text-secondary" />
                        Preview Logo.dev
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <div className="p-6 rounded-2xl bg-black border border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-bold text-secondary uppercase tracking-widest">Pricing</div>
                <button
                  type="button"
                  onClick={() => {
                    if (editingField === 'pricing') {
                      saveField('pricing');
                      return;
                    }
                    setFieldDrafts({
                      ...fieldDrafts,
                      pricingBucket: editedTool.pricingBucket || PricingBucket.UNKNOWN,
                      pricingNotes: editedTool.pricingNotes || ''
                    });
                    setEditingField('pricing');
                  }}
                  className="p-1.5 rounded-full bg-black border border-border text-secondary hover:text-white hover:border-gray-500 transition-all w-8 h-8 flex items-center justify-center"
                  title={editingField === 'pricing' ? 'Save pricing' : 'Edit pricing'}
                >
                  {editingField === 'pricing' ? <Check size={14} /> : <Pencil size={14} />}
                </button>
              </div>
              {editingField === 'pricing' ? (
                <>
                  <select
                    className="w-full bg-black border border-border rounded-lg px-3 py-2 text-white focus:border-primary focus:outline-none transition-colors text-base md:text-sm mb-3"
                    value={fieldDrafts.pricingBucket}
                    onChange={(e) =>
                      setFieldDrafts({ ...fieldDrafts, pricingBucket: e.target.value as PricingBucket })
                    }
                  >
                    {Object.values(PricingBucket).map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <textarea
                    className="w-full min-h-[140px] bg-black border border-border rounded-lg px-3 py-3 text-white focus:border-primary focus:outline-none transition-colors text-base md:text-sm resize-none"
                    placeholder="Pricing notes"
                    value={fieldDrafts.pricingNotes}
                    onChange={(e) =>
                      setFieldDrafts({ ...fieldDrafts, pricingNotes: e.target.value })
                    }
                  />
                </>
              ) : (
                <>
                  <div className="text-white font-semibold text-lg mb-1">{editedTool.pricingBucket}</div>
                  <div className="text-sm text-gray-500">{editedTool.pricingNotes || 'No details provided'}</div>
                </>
              )}
            </div>
            <div className="md:col-span-2 p-6 rounded-2xl bg-black border border-border">
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs font-bold text-secondary uppercase tracking-widest">Best Use Cases</div>
                <button
                  type="button"
                  onClick={() => {
                    if (editingField === 'bestUseCases') {
                      saveField('bestUseCases');
                      return;
                    }
                    setFieldDrafts({
                      ...fieldDrafts,
                      bestUseCases: (editedTool.bestUseCases || []).map((item) => `- ${item}`).join('\n')
                    });
                    setEditingField('bestUseCases');
                  }}
                  className="p-1.5 rounded-full bg-black border border-border text-secondary hover:text-white hover:border-gray-500 transition-all w-8 h-8 flex items-center justify-center"
                  title={editingField === 'bestUseCases' ? 'Save best use cases' : 'Edit best use cases'}
                >
                  {editingField === 'bestUseCases' ? <Check size={14} /> : <Pencil size={14} />}
                </button>
              </div>
              {editingField === 'bestUseCases' ? (
                <textarea
                  className="w-full min-h-[160px] bg-black border border-border rounded-lg p-3 text-gray-300 focus:border-primary focus:outline-none transition-colors text-base md:text-sm"
                  placeholder="- One use case per line"
                  value={fieldDrafts.bestUseCases}
                  onChange={(e) => setFieldDrafts({ ...fieldDrafts, bestUseCases: e.target.value })}
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {editedTool.bestUseCases.map((use, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-sm text-gray-300">
                      <div className="mt-0.5 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Check size={12} className="text-primary" />
                      </div>
                      <span>{use}</span>
                    </div>
                  ))}
                  {editedTool.bestUseCases.length === 0 && (
                    <span className="text-gray-600 text-sm italic">None listed</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
             <NoteSection title="What it does" value={noteDrafts.whatItDoes} field="whatItDoes" onChange={updateNotes} onBlur={saveNote} showEdit isEditing={editingNoteField === 'whatItDoes'} onRequestEdit={(field) => {
               setEditingNoteField(field);
               const el = document.getElementById(`note-${field}`);
               if (el instanceof HTMLTextAreaElement) {
                 el.focus();
               }
             }} />
             <NoteSection title="When to use" value={noteDrafts.whenToUse} field="whenToUse" onChange={updateNotes} onBlur={saveNote} />
             <NoteSection title="How to use" value={noteDrafts.howToUse} field="howToUse" onChange={updateNotes} onBlur={saveNote} />
             <NoteSection title="Gotchas & Limits" value={noteDrafts.gotchas} field="gotchas" onChange={updateNotes} onBlur={saveNote} />
             <NoteSection title="Links & References" value={noteDrafts.links} field="links" onChange={updateNotes} onBlur={saveNote} />
          </div>
          <div className="mt-12 pt-8 border-t border-border flex flex-col gap-4">
            <input
              className="bg-transparent border-b border-border text-base md:text-sm text-white focus:border-primary focus:outline-none w-full py-2"
              placeholder="Type new tag and press Enter..."
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={addTag}
            />
            <div className="flex flex-wrap gap-2">
              {editedTool.tags.map(tag => (
                <span key={tag} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black border border-border text-xs font-medium text-secondary">
                  <button
                    type="button"
                    onClick={() => {
                      onTagSelect(tag);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 hover:text-white transition-colors"
                  >
                    <Tag size={12} />
                    {tag}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="ml-1 text-secondary hover:text-white transition-colors"
                    title="Remove tag"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
              {editedTool.tags.length === 0 && (
                <span className="text-xs text-gray-600 italic">No tags yet</span>
              )}
            </div>
             {isAdmin && (
               <button
                 type="button"
                 onClick={() => onAddToCatalog(editedTool.id)}
                 className="self-start text-[11px] uppercase tracking-[0.2em] text-secondary hover:text-white transition-colors flex items-center gap-2"
               >
                 <BookOpen size={14} className="text-secondary" />
                 Add To Catalog
               </button>
             )}
          </div>
          <div className="text-xs text-gray-700 mt-10 text-center font-mono uppercase tracking-widest opacity-50">
            Added on {new Date(editedTool.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>

      {showLogoPreview && logoPreviewUrl && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm pointer-events-auto">
          <div className="bg-surface border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-fade-in-up">
            <h3 className="text-lg font-bold text-white">Logo.dev Preview</h3>
            <p className="text-sm text-secondary mt-2">Use this logo for all users?</p>
            <div className="mt-4 flex items-center justify-center">
              <div className="w-16 h-16 rounded-xl bg-black border border-border overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoPreviewUrl} alt="Logo preview" className="w-full h-full object-cover" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowLogoPreview(false)}
                className="px-4 py-2 rounded-full bg-surface border border-border text-white text-sm font-medium hover:bg-surfaceHover"
              >
                Cancel
              </button>
              <button
                onClick={applyLogoPreview}
                className="px-4 py-2 rounded-full bg-primary text-white text-sm font-bold hover:bg-primaryHover"
              >
                Save for All Users
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

const DeleteConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  toolName
}: {
  isOpen: boolean,
  onClose: () => void,
  onConfirm: () => void,
  toolName: string
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[60] flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-6 text-center animate-fade-in-up">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={32} className="text-red-500" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Delete Tool?</h3>
        <p className="text-gray-400 text-sm mb-6 leading-relaxed">
          Are you sure you want to delete <span className="text-white font-semibold">{toolName}</span>? This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 py-2.5 rounded-full bg-surface border border-border text-white font-medium hover:bg-surfaceHover transition-all"
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-full bg-red-500 text-white font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

// 6. Main Page
export default function Page() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone?: 'success' | 'error' } | null>(null);
  const [tagFilter, setTagFilter] = useState('');
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [catalogTools, setCatalogTools] = useState<GlobalTool[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogCategory, setCatalogCategory] = useState('All');
  const [catalogSearch, setCatalogSearch] = useState('');

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [isProfileSetupOpen, setIsProfileSetupOpen] = useState(false);
  const [profilePromptDismissed, setProfilePromptDismissed] = useState(false);
  
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [toolToDelete, setToolToDelete] = useState<Tool | null>(null);
  const [enrichmentNotice, setEnrichmentNotice] = useState<{ title: string; message: string } | null>(null);

  const { user, loading } = useAuth();
  const isAdmin = user?.email?.toLowerCase() === 'cloudberrystickers@gmail.com';

// 1. Initialize & Sync Data (Firestore)
  useEffect(() => {
    if (!user) return;

    let unsubscribeTools: () => void;
    let unsubscribeCats: () => void;

    // Subscribe to Firestore changes
    unsubscribeTools = subscribeToUserTools(user.uid, async (userTools) => {
      const toolIds = userTools.map((tool) => tool.toolId);
      const globalMap = await fetchGlobalTools(toolIds);
      const merged = userTools.map((tool) =>
        mergeGlobalAndUser(globalMap.get(tool.toolId), tool)
      );
      setTools(merged);
    });
    unsubscribeCats = subscribeToCategories(user.uid, (cloudCats) => {
      if (cloudCats && cloudCats.length > 0) {
        setCategories(mergeWithDefaultCategories(cloudCats));
      } else {
        // Initialize user with default categories if they don't have any yet
        // (Can optionally do this in handleUpdateCategories, but here ensures defaults load)
        // For now, we just rely on defaults in state if DB is empty
      }
    });

    return () => {
      if (unsubscribeTools) unsubscribeTools();
      if (unsubscribeCats) unsubscribeCats();
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      setIsProfileSetupOpen(false);
      return;
    }

    let isMounted = true;
    setProfileLoading(true);
    const dismissedKey = `tool_vault_profile_prompt_dismissed_${user.uid}`;
    const dismissed = localStorage.getItem(dismissedKey) === 'true';
    setProfilePromptDismissed(dismissed);

    fetchUserProfile(user.uid)
      .then((data) => {
        if (!isMounted) return;
        setProfile(data);
        setIsProfileSetupOpen(!dismissed);
      })
      .catch(() => {
        if (!isMounted) return;
        setProfile(null);
        setIsProfileSetupOpen(!dismissed);
      })
      .finally(() => {
        if (!isMounted) return;
        setProfileLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (user && !profileLoading) {
      // Show on every login for now (testing); still persist the flag.
      setOnboardingStep(0);
      setIsOnboardingOpen(true);
    } else {
      setIsOnboardingOpen(false);
    }
  }, [user, profileLoading]);

  const persistOnboarding = (startMode: 'empty' | 'catalog') => {
    localStorage.setItem('tool_vault_onboarding_completed', 'true');
    localStorage.setItem('tool_vault_onboarding_start_mode', startMode);
  };

  const handleOnboardingSkip = () => {
    persistOnboarding('empty');
    setIsOnboardingOpen(false);
  };

  const handleStartEmpty = () => {
    persistOnboarding('empty');
    setIsOnboardingOpen(false);
  };


  const CATALOG_TABS = [
    'All',
    'AI',
    'Automation',
    'Analytics',
    'Backends',
    'CRM',
    'Design',
    'Development',
    'Notes',
    'Forms',
    'Productivity',
  ];

  const matchesCatalogCategory = (tool: GlobalTool, tab: string) => {
    const lower = (tool.category || '').toLowerCase();
    const tabLower = tab.toLowerCase();
    if (tabLower === 'all') return true;
    if (tabLower === 'notes') {
      return lower.includes('notes') || lower.includes('knowledge') || lower.includes('docs');
    }
    return lower.includes(tabLower);
  };

  const matchesCatalogSearch = (tool: GlobalTool, query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      tool.name?.toLowerCase().includes(q) ||
      tool.summary?.toLowerCase().includes(q) ||
      tool.tags?.some((tag) => tag.toLowerCase().includes(q))
    );
  };

  const filteredCatalogTools = catalogTools.filter((tool) =>
    matchesCatalogCategory(tool, catalogCategory) &&
    matchesCatalogSearch(tool, catalogSearch)
  );

  const handleStartCatalog = () => {
    persistOnboarding('catalog');
    setIsOnboardingOpen(false);
    setIsCatalogOpen(true);
  };

  const handleProfileSave = async (nextProfile: UserProfile) => {
    if (!user) return;
    const payload: UserProfile = {
      ...nextProfile,
      name: nextProfile.name || profile?.name || user.displayName || undefined,
      email: user.email || nextProfile.email || '',
      createdAt: profile?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    try {
      await saveUserProfile(user.uid, payload);
      const dismissedKey = `tool_vault_profile_prompt_dismissed_${user.uid}`;
      localStorage.setItem(dismissedKey, 'true');
      setProfilePromptDismissed(true);
      setProfile(payload);
      setIsProfileSetupOpen(false);
      setIsAccountSettingsOpen(false);
      showToast('Saved');
    } catch (err) {
      console.error('Failed to save profile', err);
      throw err;
    }
  };

  const handleProfileSkip = () => {
    if (!user) return;
    const dismissedKey = `tool_vault_profile_prompt_dismissed_${user.uid}`;
    localStorage.setItem(dismissedKey, 'true');
    setProfilePromptDismissed(true);
    setIsProfileSetupOpen(false);
  };

  const handleProfileClear = async () => {
    if (!user) return;
    const confirmed = window.confirm('Clear your profile info? You will be asked to enter your name again.');
    if (!confirmed) return;
    await clearUserProfile(user.uid);
    setProfile(null);
    setIsAccountSettingsOpen(false);
    setIsProfileSetupOpen(true);
  };

  const loadCatalog = useCallback(async () => {
    if (!user) return;
    setCatalogLoading(true);
    try {
      const entries = await fetchCatalogEntries();
      const toolIds = entries.map((entry) => entry.toolId).filter(Boolean);
      const globalMap = await fetchGlobalTools(toolIds);
      const tools = toolIds
        .map((toolId) => globalMap.get(toolId))
        .filter((tool): tool is GlobalTool => Boolean(tool));
      setCatalogTools(tools);
    } catch (error) {
      console.error('Failed to load catalog', error);
    } finally {
      setCatalogLoading(false);
    }
  }, [user]);

  const handleAddCatalogTool = async (globalTool: GlobalTool) => {
    if (!user) return;
    const existing = tools.find((t) => t.id === globalTool.toolId);
    if (existing) {
      alert('This tool is already in your vault.');
      openExistingTool(existing.id);
      return;
    }
    try {
      const tool = globalToTool(globalTool);
      await addUserToolToFirestore(user.uid, tool);
    } catch (error) {
      console.error('Failed to add catalog tool', error);
      alert('Failed to add tool to your vault.');
    }
  };

  const handleAddToCatalog = async (toolId: string) => {
    try {
      await addToolToCatalog(toolId);
      alert('Added to Tool Catalog.');
    } catch (error: any) {
      alert(error?.message || 'Failed to add tool to catalog.');
    }
  };

  useEffect(() => {
    if (isCatalogOpen && user) {
      loadCatalog();
    }
  }, [isCatalogOpen, user, loadCatalog]);

  const resolveToolForCloud = async (tool: Tool) => {
    const inputValue = tool.url || tool.name;
    const resolved = await enrichToolData(inputValue, categories);
    return { ...tool, id: resolved.toolId };
  };


  const openExistingTool = (toolId: string) => {
    setSelectedToolId(toolId);
  };

  // Actions
  const handleAddTool = async (newTool: Tool) => {
    const existing = tools.find((t) => t.id === newTool.id);
    if (existing) {
      alert('This tool is already in your vault.');
      openExistingTool(existing.id);
      setIsAddModalOpen(false);
      return;
    }

    if (user) {
      try {
        await addUserToolToFirestore(user.uid, newTool);
      } catch (e) {
        alert("Failed to save to cloud.");
        return;
      }
    } else {
      setTools(prev => [newTool, ...prev]);
    }
    setIsAddModalOpen(false);
  };

  const handleUpdateTool = async (updatedTool: Tool) => {
    if (user) {
       try {
         await updateUserToolInFirestore(user.uid, updatedTool);
       } catch (e) {
         alert("Failed to update in cloud.");
       }
    } else {
       setTools(prev => prev.map(t => t.id === updatedTool.id ? updatedTool : t));
    }
  };

  const handleDeleteTool = async () => {
    if (!toolToDelete) return;
    
    if (user) {
      try {
        await deleteUserToolFromFirestore(user.uid, toolToDelete.id);
      } catch (e) {
        alert("Failed to delete from cloud.");
      }
    } else {
      setTools(prev => prev.filter(t => t.id !== toolToDelete.id));
    }
    setToolToDelete(null);
    setSelectedToolId(null);
  };

  const handleUpdateCategories = (newCats: string[]) => {
    const normalized = mergeWithDefaultCategories(newCats);

    if (user) {
      // Optimistic update for categories to avoid UI jump
      setCategories(normalized);
      syncCategoriesToFirestore(user.uid, normalized);
    } else {
      setCategories(normalized);
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (Array.isArray(imported)) {
           // Filter for duplicates based on ID
           const currentIds = new Set(tools.map(t => t.id));
           const uniqueNewTools = imported.filter((t: Tool) => !currentIds.has(t.id));

           if (uniqueNewTools.length > 0) {
             if (user) {
               // Batch import to firestore? Or one by one for simplicity
               // Promise.all for speed
               await Promise.all(uniqueNewTools.map(async (t: Tool) => {
                 const resolved = await resolveToolForCloud(t);
                 await addUserToolToFirestore(user.uid, resolved);
               }));
               alert(`${uniqueNewTools.length} tools imported to cloud.`);
             } else {
               setTools(prev => [...uniqueNewTools, ...prev]);
               alert(`${uniqueNewTools.length} tools imported locally.`);
             }
           } else {
             alert("No new unique tools found in import.");
           }
        }
      } catch (err) {
        alert("Failed to parse JSON.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Filter Logic
  const filteredTools = useMemo(() => {
    return tools.filter(tool => {
      const matchesCategory = activeCategory === 'All' || tool.category === activeCategory;
      const q = searchQuery.toLowerCase();
      const matchesSearch = 
        tool.name.toLowerCase().includes(q) || 
        tool.summary.toLowerCase().includes(q) ||
        tool.tags.some(t => t.toLowerCase().includes(q)) ||
        tool.notes.whatItDoes.toLowerCase().includes(q);
      
      return matchesCategory && matchesSearch;
    });
  }, [tools, activeCategory, searchQuery]);

  const selectedTool = useMemo(() => tools.find(t => t.id === selectedToolId), [tools, selectedToolId]);

  const showToast = (message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 2000);
  };

  const handleTagSelect = (tag: string) => {
    setTagFilter(tag);
    setSearchQuery(tag);
    setActiveCategory('All');
  };

  const displayName = profile?.name || user?.displayName || 'User';

  if (loading || profileLoading) {
    return null;
  }

  if (!user) {
    return <LoginModal isOpen />;
  }

  return (
    <div className="flex min-h-screen bg-black text-gray-200 font-sans selection:bg-primary/30">
      
      <Sidebar 
        categories={categories} 
        activeCategory={activeCategory} 
        onCategorySelect={setActiveCategory}
        onExport={() => exportData(tools)}
        onImport={handleImport}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenAccountSettings={() => setIsAccountSettingsOpen(true)}
        userDisplayName={displayName}
      />

      <main className="ml-0 lg:ml-64 flex-1 flex flex-col h-screen overflow-hidden">
        
        <header className="h-16 md:h-20 border-b border-border bg-black/80 backdrop-blur-md px-4 md:px-8 flex items-center justify-between sticky top-0 z-10 gap-3">
          
          <button 
            className="lg:hidden p-3 -ml-2 mr-2 text-secondary hover:text-white"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu size={24} />
          </button>

          <div className="relative flex-1 max-w-lg group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Search..." 
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setTagFilter('');
              }}
              className="w-full bg-surface border border-border rounded-full py-2 md:py-2.5 pl-11 pr-5 text-gray-200 focus:outline-none focus:border-primary/50 transition-all shadow-sm text-base md:text-sm"
            />
          </div>

          <div className="flex items-center gap-2 md:gap-4 shrink-0">
            <div className="hidden sm:flex bg-surface rounded-full p-1 border border-border">
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-full transition-all duration-300 ${viewMode === 'grid' ? 'bg-black text-primary shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
              >
                <LayoutGrid size={18} />
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-full transition-all duration-300 ${viewMode === 'list' ? 'bg-black text-primary shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
              >
                <ListIcon size={18} />
              </button>
            </div>
            
            <button 
              onClick={() => setIsCatalogOpen(true)}
              className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full bg-surface border border-border text-xs font-bold text-secondary hover:text-white hover:border-gray-500 transition-all"
            >
              <BookOpen size={16} />
              Tool Catalog
            </button>
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center justify-center gap-2 bg-primary text-white w-10 h-10 md:w-auto md:h-auto md:px-5 md:py-2.5 rounded-full font-bold text-sm hover:bg-primaryHover transition-all shadow-[0_0_20px_-5px_rgba(236,72,153,0.4)] hover:shadow-[0_0_25px_-5px_rgba(236,72,153,0.6)]"
            >
              <Plus size={20} className="md:w-[18px] md:h-[18px]" /> 
              <span className="hidden md:inline">Add Tool</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          
          <div className="mb-6 md:mb-8 flex justify-between items-end">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-1 md:mb-2 tracking-tight">{activeCategory === 'All' ? 'Library' : activeCategory}</h2>
              <div className="flex items-center gap-2">
                <p className="text-secondary text-xs md:text-sm">{filteredTools.length} tools found</p>
                <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded border border-primary/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span> Cloud Sync Active
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {(activeCategory !== 'All' || tagFilter || (!tagFilter && searchQuery)) && (
                  <span className="text-[10px] uppercase tracking-wider text-gray-500">Filtered by</span>
                )}
                {(activeCategory !== 'All' || tagFilter || (!tagFilter && searchQuery)) && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCategory('All');
                      setTagFilter('');
                      setSearchQuery('');
                    }}
                    className="text-[10px] bg-black border border-border rounded-full px-2 py-1 text-secondary hover:text-white hover:border-primary/40 transition-colors"
                  >
                    Clear all <span className="ml-1">x</span>
                  </button>
                )}
                {activeCategory !== 'All' && (
                  <button
                    type="button"
                    onClick={() => setActiveCategory('All')}
                    className="text-[10px] bg-black border border-border rounded-full px-2 py-1 text-secondary hover:text-white hover:border-primary/40 transition-colors"
                  >
                    Category: {activeCategory} <span className="ml-1">x</span>
                  </button>
                )}
                {tagFilter && (
                  <button
                    type="button"
                    onClick={() => { setTagFilter(''); setSearchQuery(''); }}
                    className="text-[10px] bg-black border border-border rounded-full px-2 py-1 text-secondary hover:text-white hover:border-primary/40 transition-colors"
                  >
                    Tag: {tagFilter} <span className="ml-1">x</span>
                  </button>
                )}
                {!tagFilter && searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-[10px] bg-black border border-border rounded-full px-2 py-1 text-secondary hover:text-white hover:border-primary/40 transition-colors"
                  >
                    Search: {searchQuery} <span className="ml-1">x</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {filteredTools.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 md:h-80 border border-dashed border-border rounded-3xl bg-surface/30 px-4 text-center">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-surface flex items-center justify-center mb-4 md:mb-6 text-gray-600 shadow-xl">
                <Search size={32} className="md:w-10 md:h-10" />
              </div>
              <p className="text-gray-400 font-medium text-base md:text-lg">No tools found.</p>
              <button onClick={() => {setSearchQuery(''); setActiveCategory('All')}} className="mt-4 text-primary text-sm font-bold hover:underline">Clear filters</button>
            </div>
          ) : (
            <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6" : "flex flex-col gap-3"}>
              {filteredTools.map(tool => (
                <div 
                  key={tool.id}
                  onClick={() => setSelectedToolId(tool.id)}
                  className={`
                    group relative bg-surface border border-border hover:border-primary/50 transition-all duration-300 cursor-pointer overflow-hidden
                    ${viewMode === 'grid' ? 'rounded-2xl p-5 md:p-6 hover:-translate-y-1 hover:shadow-glow' : 'rounded-xl p-4 flex items-center gap-6 md:gap-8 hover:bg-surfaceHover'}
                  `}
                >
                  <div className={`flex ${viewMode === 'grid' ? 'flex-col items-start' : 'items-center w-full'}`}>
                    <div className="mb-4 md:mb-5 shrink-0 relative">
                       <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-black border border-border flex items-center justify-center text-lg font-bold text-gray-500 group-hover:border-primary/50 transition-colors overflow-hidden relative shadow-lg">
                          <ToolIcon url={tool.logoUrl} websiteUrl={tool.url} name={tool.name} />
                       </div>
                    </div>
                    
                    <div className={`flex-1 min-w-0 w-full ${viewMode === 'list' ? 'pl-2 md:pl-4' : ''}`}>
                      <div className="flex items-center justify-between mb-1 md:mb-2">
                        <h3 className="font-bold text-base md:text-lg text-white group-hover:text-primary transition-colors truncate tracking-tight">{tool.name}</h3>
                        <div className="flex items-center gap-2">
                          {viewMode === 'list' && (
                            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${getStatusStyles(tool.status)}`}>
                              {tool.status || ToolStatus.INTERESTED}
                            </span>
                          )}
                          {viewMode === 'list' && <span className="text-[10px] md:text-xs font-medium text-secondary px-2 py-0.5 md:px-2.5 md:py-1 rounded-full bg-black border border-border">{tool.category}</span>}
                        </div>
                      </div>
                      <p className="text-sm text-gray-400 line-clamp-2 leading-relaxed">{tool.summary}</p>
                    </div>

                    {viewMode === 'grid' && (
                      <div className="mt-4 md:mt-6 pt-3 md:pt-4 border-t border-border/50 w-full flex items-center justify-between text-[10px] md:text-xs font-medium text-gray-500">
                        <span className="bg-black px-2 py-1 md:px-2.5 rounded-md border border-border group-hover:border-primary/20 transition-colors">{tool.category}</span>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${getStatusStyles(tool.status)}`}>
                            {tool.status || ToolStatus.INTERESTED}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <ProfileSetupModal
        isOpen={isProfileSetupOpen}
        email={user?.email || ''}
        initialProfile={profile}
        displayName={user?.displayName || profile?.name}
        onSave={handleProfileSave}
        onSkip={handleProfileSkip}
      />

      {toast && (
        <div className="fixed bottom-6 right-6 z-[90]">
          <div className="px-4 py-2 rounded-full text-xs font-semibold bg-black border border-border text-white shadow-lg">
            {toast.message}
          </div>
        </div>
      )}

      <AddToolModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onSave={handleAddTool} 
        categories={categories}
        onNotice={(notice) => setEnrichmentNotice(notice)}
        onUpdateCategories={handleUpdateCategories}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        categories={categories}
        onUpdateCategories={handleUpdateCategories}
        onOpenAccountSettings={() => {
          setIsSettingsOpen(false);
          setIsAccountSettingsOpen(true);
        }}
      />

      <AccountSettingsModal
        isOpen={isAccountSettingsOpen}
        email={user?.email || ''}
        profile={profile}
        onSave={handleProfileSave}
        onClear={handleProfileClear}
        onClose={() => setIsAccountSettingsOpen(false)}
      />

      <DeleteConfirmationModal
        isOpen={!!toolToDelete}
        onClose={() => setToolToDelete(null)}
        onConfirm={handleDeleteTool}
        toolName={toolToDelete?.name || 'this tool'}
      />

      {enrichmentNotice && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-fade-in-up">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white">{enrichmentNotice.title}</h3>
                <p className="text-sm text-secondary mt-2">{enrichmentNotice.message}</p>
              </div>
              <button
                onClick={() => setEnrichmentNotice(null)}
                className="text-secondary hover:text-white transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setEnrichmentNotice(null)}
                className="px-4 py-2 rounded-full bg-primary text-white text-sm font-bold hover:bg-primaryHover transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}


      <div className="fixed bottom-3 right-4 z-20 text-[11px] text-secondary">
        <a href="https://logo.dev">Logos provided by Logo.dev</a>
      </div>

      {isOnboardingOpen && user && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl animate-fade-in-up">
            <div className="p-8">
              {onboardingStep === 0 && (
                <div className="space-y-6">
                  <h2 className="text-2xl md:text-3xl font-bold text-white">Welcome to Tool Vault</h2>
                  <p className="text-secondary text-sm md:text-base">A place to organize tools you use, test, or want to remember. Fully customizable and searchable.</p>
                  <div className="space-y-2 text-sm text-gray-300">
                    <div className="flex items-center gap-2"><Check size={16} className="text-primary" /> Organize tools in one place</div>
                    <div className="flex items-center gap-2"><Check size={16} className="text-primary" /> Add notes, tags, and status</div>
                    <div className="flex items-center gap-2"><Check size={16} className="text-primary" /> Search instantly across your vault</div>
                  </div>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={handleOnboardingSkip}
                      className="text-xs text-secondary hover:text-white transition-colors"
                    >
                      Skip
                    </button>
                    <button
                      onClick={() => setOnboardingStep(1)}
                      className="px-6 py-2.5 rounded-full bg-primary text-white text-sm font-bold hover:bg-primaryHover transition-colors"
                    >
                      Get Started
                    </button>
                  </div>
                </div>
              )}

              {onboardingStep === 1 && (
                <div className="space-y-6">
                  <h2 className="text-2xl md:text-3xl font-bold text-white">How you&apos;ll use Tool Vault</h2>
                  <div className="space-y-4 text-sm text-gray-300">
                    <div className="flex items-start gap-3">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-black border border-border text-secondary mt-0.5">
                        <Plus size={14} />
                      </span>
                      <div><span className="text-white font-semibold">Add a tool:</span> Paste a name or URL and let Tool Vault fill the basics</div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-black border border-border text-secondary mt-0.5">
                        <PenTool size={14} />
                      </span>
                      <div><span className="text-white font-semibold">Edit it:</span> Add your personal notes, tags, and status</div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-black border border-border text-secondary mt-0.5">
                        <Trash2 size={14} />
                      </span>
                      <div><span className="text-white font-semibold">Remove it:</span> Delete tools anytime (your vault, your rules)</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={handleOnboardingSkip}
                      className="text-xs text-secondary hover:text-white transition-colors"
                    >
                      Skip
                    </button>
                    <button
                      onClick={() => setOnboardingStep(2)}
                      className="px-6 py-2.5 rounded-full bg-primary text-white text-sm font-bold hover:bg-primaryHover transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}

              {onboardingStep === 2 && (
                <div className="space-y-6">
                  <h2 className="text-2xl md:text-3xl font-bold text-white">How do you want to start?</h2>
                  <div className="space-y-3">
                    <button
                      onClick={handleStartEmpty}
                      className="w-full text-left p-4 rounded-xl bg-black border border-border hover:border-primary/50 transition-colors"
                    >
                      <div className="text-white font-semibold">Start With Empty Vault</div>
                    </button>
                    <button
                      onClick={handleStartCatalog}
                      className="w-full text-left p-4 rounded-xl bg-black border border-border hover:border-primary/50 transition-colors"
                    >
                      <div className="text-white font-semibold">Browse Tool Catalog</div>
                                          </button>
                  </div>
                  <p className="text-[11px] text-secondary">You can revisit the Tool Catalog anytime to add tools to your vault.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isCatalogOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div className="flex items-center gap-2 text-white font-bold"><BookOpen size={18} /> Tool Catalog</div>
              <button onClick={() => setIsCatalogOpen(false)} className="text-secondary hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {!user && (
                <div className="text-sm text-secondary">Sign in to browse and add tools from the catalog.</div>
              )}
              {user && catalogLoading && (
                <div className="text-sm text-secondary">Loading catalog...</div>
              )}
              {user && !catalogLoading && catalogTools.length === 0 && (
                <div className="text-sm text-secondary">No tools in the catalog yet.</div>
              )}
              {user && !catalogLoading && catalogTools.length > 0 && (
                <>
                  <div className="mb-4">
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                      <input
                        type="text"
                        value={catalogSearch}
                        onChange={(e) => setCatalogSearch(e.target.value)}
                        placeholder="Search catalog..."
                        className="w-full bg-black border border-border rounded-full py-2 pl-9 pr-4 text-gray-200 focus:outline-none focus:border-primary/50 transition-all text-sm"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                    {CATALOG_TABS.map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setCatalogCategory(tab)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                          catalogCategory === tab
                            ? 'bg-primary/20 text-primary border-primary/30'
                            : 'bg-black text-secondary border-border hover:text-white hover:border-gray-500'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                  </div>
                  {filteredCatalogTools.length === 0 ? (
                    <div className="text-sm text-secondary">No tools in this category yet.</div>
                  ) : (
                    <div className="space-y-3">
                      {filteredCatalogTools.map((tool) => (
                        <div key={tool.toolId} className="flex items-start justify-between gap-4 p-4 rounded-xl bg-black border border-border">
                          <div className="flex items-start gap-4 min-w-0">
                            <div className="w-10 h-10 rounded-lg bg-black border border-border overflow-hidden shrink-0">
                              <ToolIcon url={tool.logoUrl} websiteUrl={tool.websiteUrl} name={tool.name} />
                            </div>
                            <div className="min-w-0">
                              <div className="text-white font-semibold">{tool.name}</div>
                              <div className="text-xs text-secondary mt-1">{tool.summary}</div>
                              {tool.tags && tool.tags.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {tool.tags.slice(0, 6).map((tag) => (
                                    <span key={tag} className="px-2 py-0.5 rounded-full bg-surface border border-border text-[10px] text-secondary">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleAddCatalogTool(tool)}
                            className="shrink-0 px-4 py-2 rounded-full bg-primary text-white text-xs font-bold hover:bg-primaryHover transition-colors"
                          >
                            Add to Vault
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {selectedToolId && selectedTool && (
        <ToolDetail 
          tool={selectedTool}
          onClose={() => setSelectedToolId(null)}
          onUpdate={handleUpdateTool}
          onRequestDelete={(id) => setToolToDelete(tools.find(t => t.id === id) || null)}
          categories={categories}
          isAdmin={isAdmin}
          onAddToCatalog={handleAddToCatalog}
          onTagSelect={handleTagSelect}
        />
      )}
    </div>
  );
}












