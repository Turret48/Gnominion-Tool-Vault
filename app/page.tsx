'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, Plus, X, LayoutGrid, List as ListIcon, Database, ArrowUpRight, Hash, Tag, 
  Check, Save, Trash2, Download, Upload, Cpu, Zap, PenTool, Mail, BarChart2, AlertTriangle, Menu,
  Settings, LogIn, LogOut, User as UserIcon, RefreshCw, Activity
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Tool, UserTool, PricingBucket, ToolStatus, DEFAULT_CATEGORIES } from '../types';
import {
  loadTools,
  saveTools,
  clearLocalTools,
  exportData,
  subscribeToUserTools,
  subscribeToCategories,
  addUserToolToFirestore,
  updateUserToolInFirestore,
  deleteUserToolFromFirestore,
  syncCategoriesToFirestore,
  fetchGlobalTools,
} from '../services/storageService';
import { enrichToolData } from '../services/geminiService';
import { useAuth } from '../context/AuthContext';
import { signInWithGoogle, logOut } from '../services/auth';
import { updateGlobalTool } from '../services/globalToolService';

// 0. Shared UI Components & Helpers
const EMPTY_NOTES = {
  whatItDoes: '',
  whenToUse: '',
  howToUse: '',
  gotchas: '',
  links: ''
};

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
    category: userTool.category || globalTool?.category || 'Other',
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
        setImgSrc(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
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
      <img 
        src={imgSrc} 
        alt={`${name} logo`} 
        className={`object-cover w-full h-full ${className}`} 
        onError={handleError} 
      />
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
  onOpenLogin,
  localToolCount,
  onSyncLocal
}: { 
  categories: string[], 
  activeCategory: string, 
  onCategorySelect: (c: string) => void,
  onExport: () => void,
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void,
  isOpen: boolean,
  onClose: () => void,
  onOpenSettings: () => void,
  onOpenLogin: () => void,
  localToolCount: number,
  onSyncLocal: () => void
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  const getIcon = (cat: string) => {
    const l = cat.toLowerCase();
    if (l.includes('ai')) return <Cpu size={18} />;
    if (l.includes('automation')) return <Zap size={18} />;
    if (l.includes('design')) return <PenTool size={18} />;
    if (l.includes('email')) return <Mail size={18} />;
    if (l.includes('analytics')) return <BarChart2 size={18} />;
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
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-lg shadow-pink-500/20">
              <Database size={16} className="text-white" />
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
                {localToolCount > 0 && (
                   <button
                     onClick={onSyncLocal}
                     className="w-full flex items-center justify-center gap-2 mb-3 px-3 py-3 rounded-lg bg-indigo-900/30 border border-indigo-500/30 text-xs font-bold text-indigo-300 hover:bg-indigo-900/50 transition-all group"
                     title="Upload local tools to account"
                   >
                     <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-500" /> 
                     Sync {localToolCount} Local Tools
                   </button>
                )}
               <div className="flex items-center gap-3 p-2 rounded-lg bg-surface border border-border/50 mb-3">
                 {user.photoURL ? (
                   <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full border border-border" />
                 ) : (
                   <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                     <UserIcon size={14} />
                   </div>
                 )}
                 <div className="flex-1 min-w-0">
                   <p className="text-xs font-bold text-white truncate">{user.displayName || 'User'}</p>
                   <p className="text-[10px] text-gray-500 truncate">{user.email}</p>
                 </div>
                 <button 
                   onClick={logOut} 
                   className="text-gray-500 hover:text-red-400 transition-colors p-2"
                   title="Sign Out"
                 >
                   <LogOut size={16} />
                 </button>
               </div>
             </>
           ) : (
             <button
               onClick={onOpenLogin}
               className="w-full flex items-center justify-center gap-2 mb-3 px-3 py-3 rounded-lg bg-surfaceHover border border-primary/20 text-xs font-bold text-primary hover:bg-primary/10 transition-all"
             >
               <LogIn size={14} /> Sign In to Sync
             </button>
           )}

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
  isOpen, 
  onClose 
}: { 
  isOpen: boolean, 
  onClose: () => void 
}) => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithGoogle();
      onClose();
    } catch (err: any) {
      console.error("Login Error:", err);
      
      let msg = 'Failed to sign in.';
      // Handle common Firebase Auth errors
      if (err.code === 'auth/popup-closed-by-user') {
        msg = 'Sign-in window was closed.';
      } else if (err.code === 'auth/cancelled-popup-request') {
        msg = 'Multiple popup requests cancelled.';
      } else if (err.code === 'auth/operation-not-allowed') {
        msg = 'Google Sign-In disabled in Firebase Console.';
      } else if (err.code === 'auth/unauthorized-domain') {
        msg = 'Domain not authorized in Firebase Console (Auth > Settings).';
      } else if (err.message) {
        msg = err.message;
      }
      
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-2xl p-8 max-w-sm w-full shadow-2xl animate-fade-in-up relative overflow-hidden">
        {/* Decorative Glow */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>
        
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center mb-6 shadow-glow">
            <Database size={32} className="text-white" />
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
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-full bg-white text-black font-bold hover:bg-gray-100 transition-colors shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
          >
             {loading ? (
                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
             ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
             )}
            <span>Sign in with Google</span>
          </button>

          <button 
            onClick={onClose}
            className="mt-6 text-xs text-secondary hover:text-white transition-colors"
          >
            Continue in Local Mode
          </button>
        </div>
      </div>
    </div>
  );
};

const SettingsModal = ({
  isOpen,
  onClose,
  categories,
  onUpdateCategories
}: {
  isOpen: boolean,
  onClose: () => void,
  categories: string[],
  onUpdateCategories: (newCats: string[]) => void
}) => {
  const [newCat, setNewCat] = useState('');

  const addCategory = () => {
    if (newCat.trim() && !categories.includes(newCat.trim())) {
      onUpdateCategories([...categories, newCat.trim()].sort());
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
               <div className="flex gap-2">
                 <input 
                   className="flex-1 bg-black border border-border rounded-lg px-4 py-2 text-white text-base md:text-sm focus:border-primary focus:outline-none"
                   placeholder="New category name..."
                   value={newCat}
                   onChange={e => setNewCat(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && addCategory()}
                 />
                 <button onClick={addCategory} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primaryHover">
                   <Plus size={18} />
                 </button>
               </div>
               
               <div className="grid grid-cols-2 gap-2">
                 {categories.map(cat => (
                   <div key={cat} className="flex items-center justify-between p-3 bg-black border border-border rounded-lg group">
                      <span className="text-sm text-gray-300">{cat}</span>
                      <button onClick={() => removeCategory(cat)} className="text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 size={14} />
                      </button>
                   </div>
                 ))}
               </div>
               <p className="text-[10px] text-gray-500 mt-4">
                 Note: Deleting a category will not delete the tools in it, but they may need re-categorization.
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
  onNotice
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSave: (tool: Tool) => void,
  categories: string[],
  onNotice: (notice: { title: string; message: string }) => void
}) => {
  const { user } = useAuth();
  const [step, setStep] = useState<'chat' | 'enriching' | 'review'>('chat');
  const [input, setInput] = useState('');
  const [draftTool, setDraftTool] = useState<Partial<Tool>>({});
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStep('chat');
      setInput('');
      setDraftTool({});
      setNewTag('');
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
    onSave(draftTool as Tool);
    onClose();
  };

  const addTag = (e: React.KeyboardEvent) => {
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
                Enter a URL or tool name. I'll search for details and set up the card for you.
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
                    <input 
                      list="category-options"
                      className="w-full bg-black border border-border rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none transition-colors text-base md:text-sm"
                      value={draftTool.category || ''}
                      onChange={e => setDraftTool({...draftTool, category: e.target.value})}
                      placeholder="Select or type..."
                    />
                    <datalist id="category-options">
                      {categories.map(c => <option key={c} value={c} />)}
                    </datalist>
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

const ToolDetail = ({ 
  tool, 
  onClose, 
  onUpdate,
  onRequestDelete,
  categories,
  isAdmin
}: { 
  tool: Tool, 
  onClose: () => void, 
  onUpdate: (t: Tool) => void, 
  onRequestDelete: (id: string) => void,
  categories: string[],
  isAdmin: boolean
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState(EMPTY_NOTES);
  const [editedTool, setEditedTool] = useState<Tool>(tool);
  const [newTag, setNewTag] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);
  const [pendingAction, setPendingAction] = useState<'close' | 'cancel' | null>(null);
  const lastToolIdRef = useRef<string | null>(null);
  const canEditAdvanced = isEditing && advancedMode;
  const canEditGlobal = isAdmin && adminMode && canEditAdvanced;

  useEffect(() => {
    if (lastToolIdRef.current !== tool.id) {
      const normalizedNotes = { ...EMPTY_NOTES, ...(tool.notes || {}) };
      lastToolIdRef.current = tool.id;
      setEditedTool({ ...tool, notes: normalizedNotes });
      setNoteDrafts(normalizedNotes);
      setIsEditing(false);
      setAdminMode(false);
      setAdvancedMode(false);
      setIsDirty(false);
      setShowUnsavedPrompt(false);
      setPendingAction(null);
      return;
    }

    if (!isEditing && !adminMode) {
      const normalizedNotes = { ...EMPTY_NOTES, ...(tool.notes || {}) };
      setEditedTool({ ...tool, notes: normalizedNotes });
      setNoteDrafts(normalizedNotes);
      setIsDirty(false);
      setAdvancedMode(false);
    }
  }, [tool, isEditing, adminMode]);

  useEffect(() => {
    if (isEditing) {
      setNoteDrafts({ ...EMPTY_NOTES, ...(editedTool.notes || {}) });
    }
  }, [isEditing]);


  const updateEditedTool = (updater: (prev: Tool) => Tool) => {
    setEditedTool((prev) => {
      const next = updater(prev);
      return next;
    });
    setIsDirty(true);
  };

  const updateNotes = (field: keyof Tool['notes'], value: string) => {
    setNoteDrafts((prev) => ({
      ...prev,
      [field]: value
    }));
    setIsDirty(true);
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

  const requestClose = () => {
    if (isDirty) {
      setPendingAction('close');
      setShowUnsavedPrompt(true);
      return;
    }
    onClose();
  };

  const requestCancelEdit = () => {
    if (isDirty) {
      setPendingAction('cancel');
      setShowUnsavedPrompt(true);
      return;
    }
    setIsEditing(false);
    setAdminMode(false);
    setAdvancedMode(false);
    setEditedTool({ ...tool, notes: { ...EMPTY_NOTES, ...(tool.notes || {}) } });
  };

  const discardEdits = () => {
    setShowUnsavedPrompt(false);
    setIsDirty(false);
    const action = pendingAction;
    setPendingAction(null);
    setIsEditing(false);
    setAdminMode(false);
    setAdvancedMode(false);
    setEditedTool({ ...tool, notes: { ...EMPTY_NOTES, ...(tool.notes || {}) } });
    if (action == 'close') {
      onClose();
    }
  };

  const handleSave = async () => {
    if (canEditGlobal) {
      const confirmed = window.confirm('These edits will affect this tool for all users. Proceed?');
      if (!confirmed) {
        return;
      }
    }

    const nextTool = {
      ...editedTool,
      notes: { ...EMPTY_NOTES, ...noteDrafts },
      updatedAt: Date.now()
    };
    onUpdate(nextTool);
    setIsDirty(false);

    if (isAdmin && adminMode) {
      try {
        await updateGlobalTool(editedTool.id, {
          name: editedTool.name,
          summary: editedTool.summary,
          pricingBucket: editedTool.pricingBucket,
          pricingNotes: editedTool.pricingNotes,
          bestUseCases: editedTool.bestUseCases,
          integrations: editedTool.integrations,
          logoUrl: editedTool.logoUrl,
          websiteUrl: editedTool.url,
          whatItDoes: noteDrafts.whatItDoes
        });
      } catch (error: any) {
        alert(error?.message || 'Failed to update global tool.');
      }
    }

    setIsEditing(false);
    setAdvancedMode(false);
  };

  const addTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTag.trim()) {
      e.preventDefault();
      const currentTags = editedTool.tags || [];
      if (!currentTags.includes(newTag.trim())) {
        setEditedTool({ ...editedTool, tags: [...currentTags, newTag.trim()] });
      }
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    updateEditedTool((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tagToRemove) }));
  };

  const NoteSection = ({ 
    title, 
    value, 
    field 
  }: { 
    title: string, 
    value: string, 
    field: keyof Tool['notes'] 
  }) => (
    <div className="mb-10 group">
      <h3 className="text-xs font-bold text-secondary uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-border/50 pb-2">
        {title}
      </h3>
      {(isEditing && (field !== 'whatItDoes' || canEditAdvanced)) ? (
        <>
          <textarea
            key={`${editedTool.id}-${field}-${advancedMode ? 'adv' : 'base'}-${isEditing ? 'edit' : 'view'}`}
            className="w-full min-h-[120px] bg-black border border-border rounded-xl p-4 text-gray-300 leading-relaxed focus:border-primary focus:outline-none transition-colors resize-none font-mono text-base md:text-sm"
            defaultValue={value || ''}
            onChange={(e) => updateNotes(field, e.target.value)}
            placeholder="Supports Markdown (e.g. **bold**, [link](url), - list)"
          />
          <p className="text-[10px] text-gray-600 mt-1 flex justify-end">Markdown Supported</p>
        </>
      ) : (
        <div className="text-gray-300 leading-relaxed text-[15px] markdown-body">
          {value ? (
            <ReactMarkdown components={{
              a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" />
            }}>
              {value}
            </ReactMarkdown>
          ) : (
            <span className="text-gray-600 italic">No notes added yet.</span>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-40 flex justify-end pointer-events-none">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto transition-opacity duration-300" 
        onClick={onClose}
      />
      <div className="w-full md:max-w-3xl h-full bg-surface border-l border-border shadow-2xl overflow-hidden flex flex-col pointer-events-auto relative transform transition-transform duration-300 ease-out animate-slide-in-right">
        <div className="absolute top-6 right-4 md:right-6 flex items-center gap-2 z-10">
          {isAdmin && isEditing && (
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
          {isEditing ? (
            <>
              <button 
                onClick={requestCancelEdit}
                className="p-2.5 rounded-full bg-black border border-border text-secondary hover:text-white hover:border-gray-500 transition-all"
                title="Cancel"
              >
                <X size={18} />
              </button>
              <button 
                onClick={handleSave}
                className="p-2.5 rounded-full bg-primary text-white hover:bg-primaryHover transition-all shadow-lg shadow-primary/20"
                title="Save"
              >
                <Save size={18} />
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={() => setIsEditing(true)}
                className="p-2.5 rounded-full bg-black border border-border text-secondary hover:text-white hover:border-gray-500 transition-all"
                title="Edit Tool"
              >
                <PenTool size={18} />
              </button>
              <button 
                onClick={() => onRequestDelete(tool.id)}
                className="p-2.5 rounded-full bg-black border border-border text-red-400 hover:text-red-300 hover:border-red-900/50 transition-all"
                title="Delete Tool"
              >
                <Trash2 size={18} />
              </button>
              <button 
                onClick={requestClose}
                className="p-2.5 rounded-full bg-black border border-border text-secondary hover:text-white hover:border-gray-500 transition-all ml-2"
              >
                <X size={18} />
              </button>
            </>
          )}
        </div>

        <div className="overflow-y-auto h-full p-6 md:p-10 custom-scrollbar">
          <div className="mb-12 pr-0 md:pr-20">
            <div className="flex flex-col md:flex-row items-start gap-6 mb-8">
              <div className="w-24 h-24 rounded-2xl bg-black border border-border flex items-center justify-center shadow-lg overflow-hidden shrink-0 relative p-1">
                 <div className="w-full h-full rounded-xl overflow-hidden bg-surface">
                   <ToolIcon url={editedTool.logoUrl} websiteUrl={editedTool.url} name={editedTool.name} />
                 </div>
              </div>
              <div className="w-full pt-1">
                {canEditAdvanced ? (
                   <input 
                    className="text-4xl md:text-5xl font-bold text-white bg-transparent border-b border-border focus:border-primary focus:outline-none w-full mb-3 pb-2"
                    value={editedTool.name}
                    onChange={(e) => setField('name', e.target.value)}
                   />
                ) : (
                   <h1 className="text-4xl md:text-5xl font-bold text-white mb-3 tracking-tight">{editedTool.name}</h1>
                )}
                <div className="flex flex-wrap items-center gap-3 text-sm">
                   {isEditing ? (
                      <>
                        <input 
                          list="category-options-detail"
                          className="bg-black border border-border text-white rounded px-2 py-1 focus:border-primary focus:outline-none text-base md:text-sm"
                          value={editedTool.category}
                          onChange={(e) => updateEditedTool((prev) => ({ ...prev, category: e.target.value }))}
                          placeholder="Category"
                        />
                        <datalist id="category-options-detail">
                          {categories.map(c => <option key={c} value={c} />)}
                        </datalist>
                      </>
                   ) : (
                      <span className="px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">{editedTool.category}</span>
                   )}
                   
                   {isEditing ? (
                     <select 
                       className="bg-black border border-border text-white rounded px-2 py-1 focus:border-primary focus:outline-none text-base md:text-sm"
                       value={editedTool.status || ToolStatus.INTERESTED}
                       onChange={(e) => updateEditedTool((prev) => ({ ...prev, status: e.target.value as ToolStatus }))}
                     >
                       {Object.values(ToolStatus).map(s => <option key={s} value={s}>{s}</option>)}
                     </select>
                   ) : (
                     <span className={`px-2.5 py-0.5 rounded-full border text-xs font-bold ${getStatusStyles(editedTool.status)}`}>
                       {editedTool.status || ToolStatus.INTERESTED}
                     </span>
                   )}

                   <span className="hidden md:inline w-1 h-1 rounded-full bg-gray-700 mx-1"></span>
                   {canEditAdvanced ? (
                      <input 
                        className="bg-transparent text-secondary border-b border-border focus:border-primary focus:outline-none w-full mt-2 md:mt-0 text-base md:text-sm"
                        value={editedTool.url}
                        onChange={(e) => setField('url', e.target.value, 'websiteUrl')}
                      />
                   ) : (
                      <a href={editedTool.url} target="_blank" rel="noopener noreferrer" className="text-secondary hover:text-white flex items-center gap-1.5 transition-colors group">
                        {editedTool.url.replace(/^https?:\/\//, '').replace(/\/$/, '')} 
                        <ArrowUpRight size={14} className="group-hover:text-primary transition-colors"/>
                      </a>
                   )}
                </div>
              </div>
            </div>
            {canEditAdvanced ? (
               <textarea
                  className="w-full bg-black border border-border rounded-lg p-4 text-xl text-gray-300"
                  value={editedTool.summary}
                  onChange={(e) => setField('summary', e.target.value)}
                />
            ) : (
              <p className="text-xl md:text-2xl text-gray-200 font-light leading-relaxed">
                {editedTool.summary}
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <div className="p-6 rounded-2xl bg-black border border-border">
              <div className="text-xs font-bold text-secondary uppercase tracking-widest mb-2">Pricing</div>
              {canEditAdvanced ? (
                <select
                  className="w-full bg-black border border-border rounded-lg px-3 py-2 text-white focus:border-primary focus:outline-none transition-colors text-base md:text-sm mb-3"
                  value={editedTool.pricingBucket || PricingBucket.UNKNOWN}
                  onChange={(e) =>
                    setField('pricingBucket', e.target.value as PricingBucket)
                  }
                >
                  {Object.values(PricingBucket).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-white font-semibold text-lg mb-1">{editedTool.pricingBucket}</div>
              )}
              {canEditAdvanced ? (
                <textarea
                  className="w-full min-h-[120px] bg-black border border-border rounded-lg px-3 py-3 text-white focus:border-primary focus:outline-none transition-colors text-base md:text-sm resize-none"
                  placeholder="Pricing notes"
                  value={editedTool.pricingNotes || ''}
                  onChange={(e) =>
                    setField('pricingNotes', e.target.value)
                  }
                />
              ) : (
                <div className="text-sm text-gray-500">{editedTool.pricingNotes || "No details provided"}</div>
              )}
            </div>
            <div className="md:col-span-2 p-6 rounded-2xl bg-black border border-border">
              <div className="text-xs font-bold text-secondary uppercase tracking-widest mb-4">Best Use Cases</div>
              {canEditAdvanced ? (
                <textarea
                  className="w-full min-h-[140px] bg-black border border-border rounded-lg p-3 text-gray-300 focus:border-primary focus:outline-none transition-colors text-base md:text-sm"
                  placeholder="- One use case per line"
                  value={editedTool.bestUseCases.map((item) => `- ${item}`).join('\n')}
                  onChange={(e) =>
                    setEditedTool({
                      ...editedTool,
                      bestUseCases: e.target.value
                        .split('\n')
                        .map((line) => line.replace(/^[-*]\s*/, '').trim())
                        .filter(Boolean)
                    })
                  }
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
             <NoteSection title="What it does" value={isEditing ? noteDrafts.whatItDoes : editedTool.notes.whatItDoes} field="whatItDoes" />
             <NoteSection title="When to use" value={isEditing ? noteDrafts.whenToUse : editedTool.notes.whenToUse} field="whenToUse" />
             <NoteSection title="How to use" value={isEditing ? noteDrafts.howToUse : editedTool.notes.howToUse} field="howToUse" />
             <NoteSection title="Gotchas & Limits" value={isEditing ? noteDrafts.gotchas : editedTool.notes.gotchas} field="gotchas" />
             <NoteSection title="Links & References" value={isEditing ? noteDrafts.links : editedTool.notes.links} field="links" />
          </div>
          <div className="mt-12 pt-8 border-t border-border flex flex-col gap-4">
             {isEditing && (
                <input 
                  className="bg-transparent border-b border-border text-base md:text-sm text-white focus:border-primary focus:outline-none w-full py-2"
                  placeholder="Type new tag and press Enter..."
                  value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  onKeyDown={addTag}
                />
             )}
             <div className="flex flex-wrap gap-2">
              {editedTool.tags.map(tag => (
                <span key={tag} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black border border-border text-xs font-medium text-secondary">
                  <Tag size={12} /> {tag}
                  {isEditing && <button onClick={() => removeTag(tag)} className="ml-1 hover:text-white"><X size={10} /></button>}
                </span>
              ))}
            </div>
             {isEditing && (
               <button
                 type="button"
                 onClick={() => setAdvancedMode((prev) => !prev)}
                 className="self-start text-[11px] uppercase tracking-[0.2em] text-secondary hover:text-primary transition-colors flex items-center gap-2"
               >
                 <Settings size={14} className={advancedMode ? 'text-primary' : 'text-secondary'} />
                 {advancedMode ? 'Advanced Edit On' : 'Advanced Edit'}
               </button>
             )}
          </div>
          <div className="text-xs text-gray-700 mt-10 text-center font-mono uppercase tracking-widest opacity-50">
            Added on {new Date(editedTool.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>
      {showUnsavedPrompt && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm pointer-events-auto">
          <div className="bg-surface border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-fade-in-up">
            <h3 className="text-lg font-bold text-white">Unsaved changes</h3>
            <p className="text-sm text-secondary mt-2">Your edits have not been saved. Discard edits?</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowUnsavedPrompt(false)}
                className="px-4 py-2 rounded-full bg-surface border border-border text-white text-sm font-medium hover:bg-surfaceHover"
              >
                Cancel
              </button>
              <button
                onClick={discardEdits}
                className="px-4 py-2 rounded-full bg-red-500 text-white text-sm font-bold hover:bg-red-600"
              >
                Discard
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
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [toolToDelete, setToolToDelete] = useState<Tool | null>(null);
  const [localToolsCount, setLocalToolsCount] = useState(0);
  const [enrichmentNotice, setEnrichmentNotice] = useState<{ title: string; message: string } | null>(null);

  const { user, loading } = useAuth();
  const isAdmin = user?.email?.toLowerCase() === 'cloudberrystickers@gmail.com';

  // 1. Initialize & Sync Data (Firestore vs Local)
  useEffect(() => {
    let unsubscribeTools: () => void;
    let unsubscribeCats: () => void;

    if (user) {
      // --- Cloud Mode ---
      // Check if there are local tools to sync
      const local = loadTools();
      setLocalToolsCount(local.length);

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
          setCategories(cloudCats);
        } else {
          // Initialize user with default categories if they don't have any yet
          // (Can optionally do this in handleUpdateCategories, but here ensures defaults load)
          // For now, we just rely on defaults in state if DB is empty
        }
      });
    } else {
      // --- Local Mode ---
      const localTools = loadTools();
      setTools(localTools);
      setLocalToolsCount(localTools.length);
      
      const storedCats = localStorage.getItem('tool_vault_categories');
      if (storedCats) {
         try {
           setCategories(JSON.parse(storedCats));
         } catch {
           setCategories(DEFAULT_CATEGORIES);
         }
      }
    }

    return () => {
      if (unsubscribeTools) unsubscribeTools();
      if (unsubscribeCats) unsubscribeCats();
    };
  }, [user]);

  // 2. Persist Local Data (Only if not logged in)
  useEffect(() => {
    if (!user) {
      saveTools(tools);
      setLocalToolsCount(tools.length);
    }
  }, [tools, user]);

  useEffect(() => {
    if (!user) {
      localStorage.setItem('tool_vault_categories', JSON.stringify(categories));
    }
  }, [categories, user]);

  const resolveToolForCloud = async (tool: Tool) => {
    const inputValue = tool.url || tool.name;
    const resolved = await enrichToolData(inputValue, categories);
    return { ...tool, id: resolved.toolId };
  };

  // Actions
  const handleAddTool = async (newTool: Tool) => {
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
    if (user) {
      // Optimistic update for categories to avoid UI jump
      setCategories(newCats);
      syncCategoriesToFirestore(user.uid, newCats);
    } else {
      setCategories(newCats);
    }
  };

  const handleSyncLocalToCloud = async () => {
    if (!user) return;
    const local = loadTools();
    if (local.length === 0) return;

    if (!confirm(`Upload ${local.length} local tools to your account? This will clear them from this device.`)) {
      return;
    }

    try {
      // Upload one by one to avoid large transaction limits if many tools
      await Promise.all(local.map(async (t) => {
        const resolved = await resolveToolForCloud(t);
        await addUserToolToFirestore(user.uid, resolved);
      }));
      
      // Clear local storage
      clearLocalTools();
      setLocalToolsCount(0);
      alert("Local tools synced to cloud successfully!");
    } catch (e) {
      console.error(e);
      alert("Failed to sync some tools. Check console.");
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
        onOpenLogin={() => setIsLoginModalOpen(true)}
        localToolCount={localToolsCount}
        onSyncLocal={handleSyncLocalToCloud}
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
              onChange={e => setSearchQuery(e.target.value)}
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
                {user ? (
                   <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded border border-primary/20 flex items-center gap-1">
                     <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span> Cloud Sync Active
                   </span>
                ) : (
                   <span className="text-[10px] bg-surface text-secondary px-2 py-0.5 rounded border border-border">Local Mode</span>
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

      <AddToolModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onSave={handleAddTool} 
        categories={categories}
        onNotice={(notice) => setEnrichmentNotice(notice)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        categories={categories}
        onUpdateCategories={handleUpdateCategories}
      />

      <DeleteConfirmationModal
        isOpen={!!toolToDelete}
        onClose={() => setToolToDelete(null)}
        onConfirm={handleDeleteTool}
        toolName={toolToDelete?.name || 'this tool'}
      />
      
      <LoginModal 
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
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

      {selectedToolId && selectedTool && (
        <ToolDetail 
          tool={selectedTool}
          onClose={() => setSelectedToolId(null)}
          onUpdate={handleUpdateTool}
          onRequestDelete={(id) => setToolToDelete(tools.find(t => t.id === id) || null)}
          categories={categories}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}