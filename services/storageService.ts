import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  getDoc 
} from 'firebase/firestore';
import { db } from './firebase';
import { Tool } from "../types";

const STORAGE_KEY = 'tool_vault_v1';

// --- Local Storage Methods ---

export const saveTools = (tools: Tool[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tools));
  } catch (e) {
    console.error("Failed to save to localStorage", e);
  }
};

export const loadTools = (): Tool[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to load from localStorage", e);
    return [];
  }
};

export const clearLocalTools = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error("Failed to clear localStorage", e);
  }
};

export const exportData = (tools: Tool[]) => {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tools, null, 2));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", "tool_vault_backup.json");
  document.body.appendChild(downloadAnchorNode); // required for firefox
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
};

// --- Firestore Methods ---

export const syncCategoriesToFirestore = async (userId: string, categories: string[]) => {
    if (!db) return;
    try {
      const userRef = doc(db, 'users', userId);
      await setDoc(userRef, { categories }, { merge: true });
    } catch (e) {
      console.error("Failed to sync categories", e);
    }
}

export const subscribeToCategories = (userId: string, onUpdate: (cats: string[]) => void) => {
    if (!db) return () => {};
    const userRef = doc(db, 'users', userId);
    return onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists() && docSnap.data().categories) {
            onUpdate(docSnap.data().categories);
        }
    });
}

export const addToolToFirestore = async (userId: string, tool: Tool) => {
  if (!db) return;
  try {
    await setDoc(doc(db, 'users', userId, 'tools', tool.id), tool);
  } catch (e) {
    console.error("Failed to add tool", e);
    throw e;
  }
};

export const updateToolInFirestore = async (userId: string, tool: Tool) => {
  if (!db) return;
  try {
    await setDoc(doc(db, 'users', userId, 'tools', tool.id), tool, { merge: true });
  } catch (e) {
    console.error("Failed to update tool", e);
    throw e;
  }
};

export const deleteToolFromFirestore = async (userId: string, toolId: string) => {
  if (!db) return;
  try {
    await deleteDoc(doc(db, 'users', userId, 'tools', toolId));
  } catch (e) {
    console.error("Failed to delete tool", e);
    throw e;
  }
};

export const subscribeToTools = (userId: string, onUpdate: (tools: Tool[]) => void) => {
  if (!db) return () => {};
  
  const toolsRef = collection(db, 'users', userId, 'tools');
  const q = query(toolsRef, orderBy('updatedAt', 'desc'));
  
  return onSnapshot(q, (snapshot) => {
    const tools = snapshot.docs.map(doc => doc.data() as Tool);
    onUpdate(tools);
  }, (error) => {
    console.error("Firestore subscription error:", error);
  });
};