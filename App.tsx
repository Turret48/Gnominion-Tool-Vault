import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, Plus, X, LayoutGrid, List as ListIcon, Database, ArrowUpRight, Hash, Tag, 
  Check, Save, Trash2, Download, Upload, Cpu, Zap, PenTool, Mail, BarChart2, AlertTriangle, Menu,
  Settings, Cloud, LogOut, User as UserIcon, Loader2
} from 'lucide-react';
import { Tool, PricingBucket, DEFAULT_CATEGORIES, FirebaseConfig } from './types';
import { loadTools, saveTools, exportData } from './services/storageService';
import { enrichToolData } from './services/geminiService';
import { 
  initFirebase, loginWithGoogle, logout, subscribeToAuth, 
  subscribeToTools, saveToolToCloud, deleteToolFromCloud, 
  subscribeToCategories, saveCategoriesToCloud, getStoredConfig, saveConfig, clearConfig
} from './services/firebase';

// 0. Shared UI Components
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
  user
}: { 
  categories: string[], 
  activeCategory: string, 
  onCategorySelect: (c: string) => void,
  onExport: () => void,
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void,
  isOpen: boolean,
  onClose: () => void,
  onOpenSettings: () => void,
  user: any
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-30 md:hidden animate-fade-in-up" 
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed top-0 bottom-0 left-0 z-40 w-64 bg-black border-r border-border flex flex-col 
        transition-transform duration-300 ease-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} 
        md:translate-x-0
      `}>
        <div className="p-6 relative flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-lg shadow-pink-500/20">
              <Database size={16} className="text-white" />
            </div>
            <h1 className="font-bold text-xl tracking-tight text-white">Tool Vault</h1>
          </div>
          
          <button 
            onClick={onClose} 
            className="absolute top-6 right-4 md:hidden text-secondary hover:text-white p-2"
          >
            <X size={20} />
          </button>

          <nav className="space-y-1 overflow-y-auto max-h-full custom-scrollbar flex-1">
            <button 
              onClick={() => { onCategorySelect('All'); onClose(); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${activeCategory === 'All' ? 'bg-surface text-primary border border-border' : 'text-secondary hover:text-white hover:bg-surface/50'}`}
            >
              <LayoutGrid size={18} />
              All Tools
            </button>
            
            <div className="pt-6 pb-3 px-3 flex items-center justify-between">
              <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Categories</span>
              <button onClick={onOpenSettings} className="text-secondary hover:text-primary transition-colors" title="Manage Categories">
                <Settings size={12} />
              </button>
            </div>
            
            {categories.map(cat => (
              <button 
                key={cat}
                onClick={() => { onCategorySelect(cat); onClose(); }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-full text-sm font-medium transition-all duration-200 ${activeCategory === cat ? 'bg-surface text-primary border border-border' : 'text-secondary hover:text-white hover:bg-surface/50'}`}
              >
                {getIcon(cat)}
                <span className="truncate">{cat}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6 border-t border-border bg-black space-y-3">
          {user ? (
            <div className="flex items-center gap-3 px-2 py-2 mb-2 rounded-lg bg-surface/50 border border-border/50">
               <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                 {user.photoURL ? <img src={user.photoURL} className="w-8 h-8 rounded-full" /> : <UserIcon size={16} />}
               </div>
               <div className="flex-1 min-w-0">
                 <p className="text-xs text-white font-medium truncate">{user.displayName || user.email}</p>
                 <p className="text-[10px] text-green-500 flex items-center gap-1"><Cloud size={8} /> Synced</p>
               </div>
            </div>
          ) : (
             <button 
              onClick={onOpenSettings}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-surface/30 border border-border/50 text-xs font-medium text-secondary hover:text-white hover:border-primary/50 hover:bg-surface/50 transition-all mb-2"
            >
              <Cloud size={14} /> Enable Cloud Sync
            </button>
          )}

          <div className="flex gap-2">
             <button 
              onClick={onExport}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-surface border border-border text-xs font-medium text-secondary hover:text-white hover:border-gray-500 transition-all hover:bg-surfaceHover"
              title="Export Data"
            >
              <Download size={14} /> Export
            </button>
             <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-surface border border-border text-xs font-medium text-secondary hover:text-white hover:border-gray-500 transition-all hover:bg-surfaceHover"
              title="Import JSON"
            >
              <Upload size={14} /> Import
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

// 2. Settings Modal (Firebase & Categories)
const SettingsModal = ({
  isOpen,
  onClose,
  categories,
  onUpdateCategories,
  user
}: {
  isOpen: boolean,
  onClose: () => void,
  categories: string[],
  onUpdateCategories: (newCats: string[]) => void,
  user: any
}) => {
  const [activeTab, setActiveTab] = useState<'sync' | 'categories'>('sync');
  const [configInput, setConfigInput] = useState<string>('');
  const [newCat, setNewCat] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    const conf = getStoredConfig();
    if (conf) {
      setConfigInput(JSON.stringify(conf, null, 2));
      setIsConfigured(true);
    }
  }, [isOpen]);

  const handleSaveConfig = () => {
    try {
      const parsed = JSON.parse(configInput);
      saveConfig(parsed);
      alert("Configuration saved. App will reload.");
    } catch {
      alert("Invalid JSON format");
    }
  };

  const handleDisconnect = () => {
    if (confirm("Disconnect from Firebase? This will revert to local storage.")) {
      clearConfig();
    }
  };

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
      <div className="bg-surface border border-border rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl shadow-pink-500/10 flex flex-col max-h-[85vh]">
        <div className="flex justify-between items-center p-6 border-b border-border">
          <h2 className="text-xl font-bold text-white">Settings</h2>
          <button onClick={onClose} className="text-secondary hover:text-white"><X size={20} /></button>
        </div>
        
        <div className="flex border-b border-border">
           <button onClick={() => setActiveTab('sync')} className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'sync' ? 'text-primary border-b-2 border-primary bg-white/5' : 'text-secondary hover:text-white'}`}>Cloud Sync</button>
           <button onClick={() => setActiveTab('categories')} className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'categories' ? 'text-primary border-b-2 border-primary bg-white/5' : 'text-secondary hover:text-white'}`}>Categories</button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {activeTab === 'sync' && (
            <div className="space-y-6">
              {!isConfigured ? (
                <>
                  <div className="bg-primary/10 border border-primary/20 p-4 rounded-lg">
                    <h3 className="text-primary font-bold text-sm mb-2 flex items-center gap-2"><Cloud size={16} /> Enable Cloud Sync</h3>
                    <p className="text-xs text-gray-300 leading-relaxed">
                      To sync across devices, paste your Firebase Project Configuration object below. 
                      You can find this in your Firebase Console {'>'} Project Settings {'>'} General.
                    </p>
                  </div>
                  <textarea 
                    className="w-full h-48 bg-black border border-border rounded-lg p-4 font-mono text-xs text-gray-300 focus:border-primary focus:outline-none"
                    placeholder={`{\n  "apiKey": "...",\n  "authDomain": "...",\n  ...\n}`}
                    value={configInput}
                    onChange={e => setConfigInput(e.target.value)}
                  />
                  <button onClick={handleSaveConfig} className="w-full py-2 bg-primary text-white rounded-lg font-bold hover:bg-primaryHover transition-colors">
                    Save & Connect
                  </button>
                </>
              ) : (
                <div className="text-center space-y-6">
                   <div className="w-16 h-16 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                     <Cloud size={32} />
                   </div>
                   <h3 className="text-xl font-bold text-white">Cloud Sync Active</h3>
                   
                   {!user ? (
                     <button onClick={() => loginWithGoogle()} className="px-6 py-2.5 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition-colors flex items-center gap-2 mx-auto">
                        <img src="https://www.google.com/favicon.ico" className="w-4 h-4" /> Sign in with Google
                     </button>
                   ) : (
                     <div className="bg-surface border border-border p-4 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {user.photoURL && <img src={user.photoURL} className="w-10 h-10 rounded-full" />}
                          <div className="text-left">
                            <div className="text-white font-bold text-sm">{user.displayName}</div>
                            <div className="text-xs text-gray-500">{user.email}</div>
                          </div>
                        </div>
                        <button onClick={() => logout()} className="p-2 bg-black border border-border rounded-full text-secondary hover:text-white">
                          <LogOut size={16} />
                        </button>
                     </div>
                   )}
                   
                   <div className="pt-8 border-t border-border">
                     <button onClick={handleDisconnect} className="text-xs text-red-500 hover:text-red-400 font-medium underline">
                       Disconnect Firebase Config
                     </button>
                   </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'categories' && (
            <div className="space-y-4">
               <div className="flex gap-2">
                 <input 
                   className="flex-1 bg-black border border-border rounded-lg px-4 py-2 text-white text-sm focus:border-primary focus:outline-none"
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
          )}
        </div>
      </div>
    </div>
  );
};

// 3. Add Tool Chat / Modal
const AddToolModal = ({ 
  isOpen, 
  onClose, 
  onSave,
  categories 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSave: (tool: Tool) => void,
  categories: string[]
}) => {
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

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setStep('enriching');
    
    // Call Gemini with dynamic categories
    const enriched = await enrichToolData(input, categories);

    let finalUrl = enriched.websiteUrl || '';
    if (!finalUrl && input.trim().startsWith('http')) {
      finalUrl = input.trim();
    }
    
    const now = Date.now();
    setDraftTool({
      id: crypto.randomUUID(),
      name: enriched.name,
      url: finalUrl,
      logoUrl: enriched.logoUrl || '',
      summary: enriched.summary,
      bestUseCases: enriched.bestUseCases,
      category: enriched.category,
      tags: enriched.tags,
      integrations: enriched.integrations,
      pricingBucket: enriched.pricingBucket,
      pricingNotes: enriched.pricingNotes,
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
  };

  const handleSave = () => {
    if (draftTool.name) {
      onSave(draftTool as Tool);
      onClose();
    }
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
                  className="w-full bg-black border border-border rounded-full px-6 py-4 pr-14 text-white placeholder-gray-600 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
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
                      className="w-full bg-black border border-border rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none transition-colors"
                      value={draftTool.name}
                      onChange={e => setDraftTool({...draftTool, name: e.target.value})}
                    />
                 </div>
                 <div className="space-y-4">
                    <label className="block text-xs font-bold text-secondary uppercase tracking-wider">URL</label>
                    <input 
                      className="w-full bg-black border border-border rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none transition-colors"
                      value={draftTool.url}
                      onChange={e => setDraftTool({...draftTool, url: e.target.value})}
                    />
                 </div>
                 <div className="col-span-1 md:col-span-2 space-y-4">
                    <label className="block text-xs font-bold text-secondary uppercase tracking-wider">Summary</label>
                    <input 
                      className="w-full bg-black border border-border rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none transition-colors"
                      value={draftTool.summary}
                      onChange={e => setDraftTool({...draftTool, summary: e.target.value})}
                    />
                 </div>
                 
                 <div className="space-y-4">
                    <label className="block text-xs font-bold text-secondary uppercase tracking-wider">Category</label>
                    <input 
                      list="category-options"
                      className="w-full bg-black border border-border rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none transition-colors"
                      value={draftTool.category}
                      onChange={e => setDraftTool({...draftTool, category: e.target.value})}
                      placeholder="Select or type..."
                    />
                    <datalist id="category-options">
                      {categories.map(c => <option key={c} value={c} />)}
                    </datalist>
                 </div>

                 <div className="space-y-4">
                    <label className="block text-xs font-bold text-secondary uppercase tracking-wider">Pricing</label>
                    <select 
                      className="w-full bg-black border border-border rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none transition-colors"
                      value={draftTool.pricingBucket}
                      onChange={e => setDraftTool({...draftTool, pricingBucket: e.target.value as PricingBucket})}
                    >
                      {Object.values(PricingBucket).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
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
                  className="bg-transparent border-b border-border text-sm text-white focus:border-primary focus:outline-none w-full py-2"
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

// 4. Tool Detail View (Document Style)
const ToolDetail = ({ 
  tool, 
  onClose,
  onUpdate,
  onRequestDelete,
  categories
}: { 
  tool: Tool, 
  onClose: () => void, 
  onUpdate: (t: Tool) => void,
  onRequestDelete: (id: string) => void,
  categories: string[]
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTool, setEditedTool] = useState<Tool>(tool);
  const [newTag, setNewTag] = useState('');

  // Sync if tool prop changes
  useEffect(() => {
    setEditedTool(tool);
    setIsEditing(false);
  }, [tool]);

  const handleSave = () => {
    onUpdate({
      ...editedTool,
      updatedAt: Date.now()
    });
    setIsEditing(false);
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
    setEditedTool({ ...editedTool, tags: editedTool.tags.filter(t => t !== tagToRemove) });
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
      {isEditing ? (
        <textarea
          className="w-full min-h-[120px] bg-black border border-border rounded-xl p-4 text-gray-300 leading-relaxed focus:border-primary focus:outline-none transition-colors resize-none"
          value={value}
          onChange={(e) => setEditedTool({
            ...editedTool,
            notes: { ...editedTool.notes, [field]: e.target.value }
          })}
        />
      ) : (
        <div className="text-gray-300 leading-relaxed whitespace-pre-wrap text-[15px]">
          {value || <span className="text-gray-600 italic">No notes added yet.</span>}
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
          {isEditing ? (
            <>
              <button 
                onClick={() => setIsEditing(false)}
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
                onClick={onClose}
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
                {isEditing ? (
                   <input 
                    className="text-4xl md:text-5xl font-bold text-white bg-transparent border-b border-border focus:border-primary focus:outline-none w-full mb-3 pb-2"
                    value={editedTool.name}
                    onChange={(e) => setEditedTool({...editedTool, name: e.target.value})}
                   />
                ) : (
                   <h1 className="text-4xl md:text-5xl font-bold text-white mb-3 tracking-tight">{editedTool.name}</h1>
                )}
                
                <div className="flex flex-wrap items-center gap-3 text-sm">
                   {isEditing ? (
                      <>
                        <input 
                          list="category-options-detail"
                          className="bg-black border border-border text-white rounded px-2 py-1 focus:border-primary focus:outline-none"
                          value={editedTool.category}
                          onChange={(e) => setEditedTool({...editedTool, category: e.target.value})}
                          placeholder="Category"
                        />
                        <datalist id="category-options-detail">
                          {categories.map(c => <option key={c} value={c} />)}
                        </datalist>
                      </>
                   ) : (
                      <span className="px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">{editedTool.category}</span>
                   )}
                   <span className="hidden md:inline w-1 h-1 rounded-full bg-gray-700 mx-1"></span>
                   {isEditing ? (
                      <input 
                        className="bg-transparent text-secondary border-b border-border focus:border-primary focus:outline-none w-full mt-2 md:mt-0"
                        value={editedTool.url}
                        onChange={(e) => setEditedTool({...editedTool, url: e.target.value})}
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

            {isEditing ? (
               <textarea
                  className="w-full bg-black border border-border rounded-lg p-4 text-xl text-gray-300"
                  value={editedTool.summary}
                  onChange={(e) => setEditedTool({...editedTool, summary: e.target.value})}
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
              <div className="text-white font-semibold text-lg mb-1">{editedTool.pricingBucket}</div>
              <div className="text-sm text-gray-500">{editedTool.pricingNotes || "No details provided"}</div>
            </div>
            
            <div className="md:col-span-2 p-6 rounded-2xl bg-black border border-border">
              <div className="text-xs font-bold text-secondary uppercase tracking-widest mb-4">Best Use Cases</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {editedTool.bestUseCases.map((use, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 text-sm text-gray-300">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Check size={12} className="text-primary" />
                    </div>
                    <span>{use}</span>
                  </div>
                ))}
                {editedTool.bestUseCases.length === 0 && <span className="text-gray-600 text-sm italic">None listed</span>}
              </div>
            </div>
          </div>

          <div className="space-y-2">
             <NoteSection title="What it does" value={editedTool.notes.whatItDoes} field="whatItDoes" />
             <NoteSection title="When to use" value={editedTool.notes.whenToUse} field="whenToUse" />
             <NoteSection title="How to use" value={editedTool.notes.howToUse} field="howToUse" />
             <NoteSection title="Gotchas & Limits" value={editedTool.notes.gotchas} field="gotchas" />
             <NoteSection title="Links & References" value={editedTool.notes.links} field="links" />
          </div>

          <div className="mt-12 pt-8 border-t border-border flex flex-col gap-4">
             {isEditing && (
                <input 
                  className="bg-transparent border-b border-border text-sm text-white focus:border-primary focus:outline-none w-full py-2"
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
          </div>

          <div className="text-xs text-gray-700 mt-10 text-center font-mono uppercase tracking-widest opacity-50">
            Added on {new Date(editedTool.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  );
};

// 5. Delete Confirmation Modal
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-2xl p-8 max-w-sm w-full shadow-2xl animate-fade-in-up">
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mb-5">
            <AlertTriangle size={28} />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Delete Tool?</h3>
          <p className="text-secondary text-sm mb-8 leading-relaxed">
            Are you sure you want to delete <span className="text-white font-semibold block mt-1">{toolName}</span>? This action cannot be undone.
          </p>
          <div className="flex w-full gap-3">
            <button 
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-full bg-transparent border border-border text-sm font-medium text-secondary hover:text-white hover:border-white/20 transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={onConfirm}
              className="flex-1 px-4 py-3 rounded-full bg-red-600 text-white text-sm font-bold hover:bg-red-500 transition-colors shadow-lg shadow-red-600/20"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// 6. Main App
function App() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Auth & Cloud State
  const [firebaseInitialized, setFirebaseInitialized] = useState(false);
  const [user, setUser] = useState<any>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [toolToDelete, setToolToDelete] = useState<Tool | null>(null);

  // 1. Initialize Firebase
  useEffect(() => {
    const initialized = initFirebase();
    setFirebaseInitialized(initialized);

    if (initialized) {
      const unsubAuth = subscribeToAuth((u) => {
        setUser(u);
        if (!u) {
          // If logged out (but initialized), revert to local data or keep empty
          // Actually, let's load local data if logged out
          const localTools = loadTools();
          setTools(localTools);
          // For categories, stick with default or local if implemented? 
          // For now, just reset categories to default or keep current in memory
          setCategories(DEFAULT_CATEGORIES);
        }
      });
      return () => unsubAuth();
    } else {
      // Offline / Local Mode
      const localTools = loadTools();
      setTools(localTools);
      // Try to load local categories if we saved them, otherwise default
      const storedCats = localStorage.getItem('tool_vault_categories');
      if (storedCats) {
         setCategories(JSON.parse(storedCats));
      }
      setIsLoaded(true);
    }
  }, []);

  // 2. Data Subscriptions (Cloud vs Local)
  useEffect(() => {
    if (user && firebaseInitialized) {
      // CLOUD MODE
      const unsubTools = subscribeToTools(user.uid, (cloudTools) => {
        setTools(cloudTools);
        setIsLoaded(true);
      });
      
      const unsubCats = subscribeToCategories(user.uid, (cloudCats) => {
        if (cloudCats && cloudCats.length > 0) {
          setCategories(cloudCats);
        }
      });

      return () => {
        unsubTools();
        unsubCats();
      };
    } else if (!firebaseInitialized && isLoaded) {
      // LOCAL MODE - Save on changes
      saveTools(tools);
      localStorage.setItem('tool_vault_categories', JSON.stringify(categories));
    }
  }, [tools, categories, user, firebaseInitialized, isLoaded]);

  // Actions
  const handleAddTool = (newTool: Tool) => {
    if (user && firebaseInitialized) {
      saveToolToCloud(user.uid, newTool);
    } else {
      setTools(prev => [newTool, ...prev]);
    }
    setIsAddModalOpen(false);
  };

  const handleUpdateTool = (updatedTool: Tool) => {
    if (user && firebaseInitialized) {
      saveToolToCloud(user.uid, updatedTool);
    } else {
      setTools(prev => prev.map(t => t.id === updatedTool.id ? updatedTool : t));
    }
  };

  const handleDeleteTool = () => {
    if (toolToDelete) {
      if (user && firebaseInitialized) {
        deleteToolFromCloud(user.uid, toolToDelete.id);
      } else {
        setTools(prev => prev.filter(t => t.id !== toolToDelete.id));
      }
      setToolToDelete(null);
      setSelectedToolId(null);
    }
  };

  const handleUpdateCategories = (newCats: string[]) => {
    if (user && firebaseInitialized) {
       saveCategoriesToCloud(user.uid, newCats);
       // Optimistic update for UI responsiveness
       setCategories(newCats);
    } else {
       setCategories(newCats);
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
           const currentIds = new Set(tools.map(t => t.id));
           const uniqueNewTools = imported.filter((t: Tool) => !currentIds.has(t.id));

           if (user && firebaseInitialized) {
              // Upload one by one to cloud
              if (confirm(`Import ${uniqueNewTools.length} tools to Cloud?`)) {
                 for (const t of uniqueNewTools) {
                    await saveToolToCloud(user.uid, t);
                 }
              }
           } else {
              if (uniqueNewTools.length > 0) {
                setTools(prev => [...uniqueNewTools, ...prev]);
              }
              alert(`${uniqueNewTools.length} tools imported locally.`);
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
        user={user}
      />

      <main className="ml-0 md:ml-64 flex-1 flex flex-col h-screen overflow-hidden">
        
        <header className="h-16 md:h-20 border-b border-border bg-black/80 backdrop-blur-md px-4 md:px-8 flex items-center justify-between sticky top-0 z-10 gap-3">
          
          <button 
            className="md:hidden p-2 -ml-2 text-secondary hover:text-white"
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
              className="w-full bg-surface border border-border rounded-full py-2 md:py-2.5 pl-11 pr-5 text-sm text-gray-200 focus:outline-none focus:border-primary/50 transition-all shadow-sm"
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
                {firebaseInitialized && !user && (
                   <span className="text-[10px] bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded border border-yellow-500/30">Offline Mode</span>
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
                    ${viewMode === 'grid' ? 'rounded-2xl p-5 md:p-6 hover:-translate-y-1 hover:shadow-glow' : 'rounded-xl p-4 flex items-center gap-4 md:gap-6 hover:bg-surfaceHover'}
                  `}
                >
                  <div className={`flex ${viewMode === 'grid' ? 'flex-col items-start' : 'items-center w-full'}`}>
                    <div className="mb-4 md:mb-5 shrink-0 relative">
                       <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-black border border-border flex items-center justify-center text-lg font-bold text-gray-500 group-hover:border-primary/50 transition-colors overflow-hidden relative shadow-lg">
                          <ToolIcon url={tool.logoUrl} websiteUrl={tool.url} name={tool.name} />
                       </div>
                    </div>
                    
                    <div className="flex-1 min-w-0 w-full">
                      <div className="flex items-center justify-between mb-1 md:mb-2">
                        <h3 className="font-bold text-base md:text-lg text-white group-hover:text-primary transition-colors truncate tracking-tight">{tool.name}</h3>
                        {viewMode === 'list' && <span className="text-[10px] md:text-xs font-medium text-secondary px-2 py-0.5 md:px-2.5 md:py-1 rounded-full bg-black border border-border">{tool.category}</span>}
                      </div>
                      <p className="text-sm text-gray-400 line-clamp-2 leading-relaxed">{tool.summary}</p>
                    </div>

                    {viewMode === 'grid' && (
                      <div className="mt-4 md:mt-6 pt-3 md:pt-4 border-t border-border/50 w-full flex items-center justify-between text-[10px] md:text-xs font-medium text-gray-500">
                        <span className="bg-black px-2 py-1 md:px-2.5 rounded-md border border-border group-hover:border-primary/20 transition-colors">{tool.category}</span>
                        <span>{tool.pricingBucket}</span>
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
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        categories={categories}
        onUpdateCategories={handleUpdateCategories}
        user={user}
      />

      <DeleteConfirmationModal
        isOpen={!!toolToDelete}
        onClose={() => setToolToDelete(null)}
        onConfirm={handleDeleteTool}
        toolName={toolToDelete?.name || 'this tool'}
      />

      {selectedToolId && selectedTool && (
        <ToolDetail 
          tool={selectedTool}
          onClose={() => setSelectedToolId(null)}
          onUpdate={handleUpdateTool}
          onRequestDelete={(id) => setToolToDelete(tools.find(t => t.id === id) || null)}
          categories={categories}
        />
      )}
    </div>
  );
}

export default App;