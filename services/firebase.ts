
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, User, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy, Firestore } from 'firebase/firestore';
import { FirebaseConfig, Tool } from '../types';

let app: FirebaseApp | undefined;
let auth: any;
let db: Firestore | undefined;

const CONFIG_KEY = 'tool_vault_firebase_config';

export const getStoredConfig = (): FirebaseConfig | null => {
  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

export const saveConfig = (config: FirebaseConfig) => {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  // Force reload to init firebase with new config
  window.location.reload(); 
};

export const clearConfig = () => {
  localStorage.removeItem(CONFIG_KEY);
  window.location.reload();
};

export const initFirebase = () => {
  const config = getStoredConfig();
  if (!config) return false;

  try {
    if (!getApps().length) {
      app = initializeApp(config);
    } else {
      app = getApp();
    }
    auth = getAuth(app);
    db = getFirestore(app);
    return true;
  } catch (e) {
    console.error("Firebase Init Error:", e);
    return false;
  }
};

export const loginWithGoogle = async () => {
  if (!auth) throw new Error("Firebase not initialized");
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
};

export const logout = async () => {
  if (!auth) return;
  return signOut(auth);
};

export const subscribeToAuth = (callback: (user: User | null) => void) => {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
};

// --- Firestore Data Methods ---

export const subscribeToTools = (userId: string, onUpdate: (tools: Tool[]) => void) => {
  if (!db) return () => {};
  
  const q = query(collection(db, `users/${userId}/tools`), orderBy('updatedAt', 'desc'));
  
  return onSnapshot(q, (snapshot) => {
    const tools: Tool[] = [];
    snapshot.forEach((doc) => {
      tools.push(doc.data() as Tool);
    });
    onUpdate(tools);
  });
};

export const subscribeToCategories = (userId: string, onUpdate: (cats: string[]) => void) => {
  if (!db) return () => {};
  
  const docRef = doc(db, `users/${userId}/settings`, 'general');
  return onSnapshot(docRef, (doc) => {
    if (doc.exists()) {
      const data = doc.data();
      if (data.categories && Array.isArray(data.categories)) {
        onUpdate(data.categories);
      }
    }
  });
};

export const saveToolToCloud = async (userId: string, tool: Tool) => {
  if (!db) return;
  await setDoc(doc(db, `users/${userId}/tools`, tool.id), tool);
};

export const deleteToolFromCloud = async (userId: string, toolId: string) => {
  if (!db) return;
  await deleteDoc(doc(db, `users/${userId}/tools`, toolId));
};

export const saveCategoriesToCloud = async (userId: string, categories: string[]) => {
  if (!db) return;
  await setDoc(doc(db, `users/${userId}/settings`, 'general'), { categories }, { merge: true });
};
