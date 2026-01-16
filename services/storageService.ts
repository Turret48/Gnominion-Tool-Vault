import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  getDoc,
  getDocs,
  where,
  documentId,
  updateDoc,
  deleteField,
} from 'firebase/firestore';
import { db } from './firebase';
import { Tool, UserTool, GlobalTool, ToolCatalogEntry, UserProfile } from '../types';

const STORAGE_KEY = 'tool_vault_v1';

// --- Local Storage Methods ---

export const saveTools = (tools: Tool[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tools));
  } catch (e) {
    console.error('Failed to save to localStorage', e);
  }
};

export const loadTools = (): Tool[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Failed to load from localStorage', e);
    return [];
  }
};

export const clearLocalTools = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear localStorage', e);
  }
};

export const exportData = (tools: Tool[]) => {
  const dataStr =
    'data:text/json;charset=utf-8,' +
    encodeURIComponent(JSON.stringify(tools, null, 2));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute('href', dataStr);
  downloadAnchorNode.setAttribute('download', 'tool_vault_backup.json');
  document.body.appendChild(downloadAnchorNode); // required for firefox
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
};

// --- Firestore Methods ---

export const syncCategoriesToFirestore = async (
  userId: string,
  categories: string[]
) => {
  if (!db) return;
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, { categories }, { merge: true });
  } catch (e) {
    console.error('Failed to sync categories', e);
  }
};

export const fetchUserProfile = async (userId: string) => {
  if (!db) return null as UserProfile | null;
  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return null;
  const data = snap.data() as Partial<UserProfile>;
  return {
    name: data.name || '',
    company: data.company,
    industry: data.industry,
    email: data.email,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
};

export const clearUserProfile = async (userId: string) => {
  if (!db) return;
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    name: deleteField(),
    company: deleteField(),
    industry: deleteField(),
    email: deleteField(),
    updatedAt: Date.now()
  });
};

export const saveUserProfile = async (userId: string, profile: UserProfile) => {
  if (!db) return;
  const userRef = doc(db, 'users', userId);
  const cleaned: Record<string, unknown> = {};
  Object.entries(profile).forEach(([key, value]) => {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  });
  await setDoc(userRef, cleaned, { merge: true });
};

export const subscribeToCategories = (
  userId: string,
  onUpdate: (cats: string[]) => void
) => {
  if (!db) return () => {};
  const userRef = doc(db, 'users', userId);
  return onSnapshot(userRef, (docSnap) => {
    if (docSnap.exists() && docSnap.data().categories) {
      onUpdate(docSnap.data().categories);
    }
  });
};

const buildUserToolPayload = (tool: Tool): UserTool => {
  const payload: UserTool = {
    toolId: tool.id,
    status: tool.status,
    notes: tool.notes,
    tags: tool.tags,
    category: tool.category,
    createdAt: tool.createdAt,
    updatedAt: tool.updatedAt,
  };

  if (tool.overrides) {
    const cleanedOverrides: Record<string, unknown> = {};
    Object.entries(tool.overrides).forEach(([key, value]) => {
      if (value !== undefined) {
        cleanedOverrides[key] = value;
      }
    });
    if (Object.keys(cleanedOverrides).length > 0) {
      payload.overrides = cleanedOverrides;
    }
  }

  return payload;
};

export const addUserToolToFirestore = async (userId: string, tool: Tool) => {
  if (!db) return;
  try {
    const payload = buildUserToolPayload(tool);
    await setDoc(doc(db, 'users', userId, 'saved_tools', tool.id), payload);
  } catch (e) {
    console.error('Failed to add tool', e);
    throw e;
  }
};

export const updateUserToolInFirestore = async (
  userId: string,
  tool: Tool
) => {
  if (!db) return;
  try {
    const payload = buildUserToolPayload(tool);
    await setDoc(doc(db, 'users', userId, 'saved_tools', tool.id), payload, {
      merge: true,
    });
  } catch (e) {
    console.error('Failed to update tool', e);
    throw e;
  }
};

export const deleteUserToolFromFirestore = async (
  userId: string,
  toolId: string
) => {
  if (!db) return;
  try {
    await deleteDoc(doc(db, 'users', userId, 'saved_tools', toolId));
  } catch (e) {
    console.error('Failed to delete tool', e);
    throw e;
  }
};

export const subscribeToUserTools = (
  userId: string,
  onUpdate: (tools: UserTool[]) => void
) => {
  if (!db) return () => {};

  const toolsRef = collection(db, 'users', userId, 'saved_tools');
  const q = query(toolsRef, orderBy('updatedAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const tools = snapshot.docs.map((docSnap) => docSnap.data() as UserTool);
      onUpdate(tools);
    },
    (error) => {
      console.error('Firestore subscription error:', error);
    }
  );
};


export const fetchCatalogEntries = async () => {
  if (!db) return [] as ToolCatalogEntry[];
  const firestore = db;
  const snap = await getDocs(collection(firestore, 'tools_catalog'));
  return snap.docs.map((docSnap) => docSnap.data() as ToolCatalogEntry);
};

export const fetchGlobalTools = async (toolIds: string[]) => {
  if (!db || toolIds.length === 0) return new Map<string, GlobalTool>();

  const firestore = db;
  const batches: string[][] = [];
  for (let i = 0; i < toolIds.length; i += 10) {
    batches.push(toolIds.slice(i, i + 10));
  }

  const results = new Map<string, GlobalTool>();
  await Promise.all(
    batches.map(async (batch) => {
      const q = query(
        collection(firestore, 'tools_global'),
        where(documentId(), 'in', batch)
      );
      const snap = await getDocs(q);
      snap.forEach((docSnap) => {
        results.set(docSnap.id, docSnap.data() as GlobalTool);
      });
    })
  );

  return results;
};

export const fetchGlobalTool = async (toolId: string) => {
  if (!db) return null;
  const firestore = db;
  const docSnap = await getDoc(doc(firestore, 'tools_global', toolId));
  return docSnap.exists() ? (docSnap.data() as GlobalTool) : null;
};
