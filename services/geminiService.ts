import { GlobalTool } from '../types';
import { auth } from './firebase';

const TIMEOUT_MS = 15000; // 15 seconds max for AI

const getIdToken = async () => {
  if (!auth?.currentUser) return null;
  try {
    return await auth.currentUser.getIdToken();
  } catch (error) {
    console.warn('Failed to get auth token:', error);
    return null;
  }
};

export const enrichToolData = async (
  input: string,
  availableCategories: string[]
): Promise<GlobalTool> => {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const idToken = await getIdToken();

    if (!idToken) {
      throw new Error('Authentication required');
    }

    const response = await fetch('/api/enrich', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ input, availableCategories }),
      signal: controller.signal,
    });

    clearTimeout(id);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          'API Route not found (404). If in preview, API features may be unavailable without a server.'
        );
      }

      const text = await response.text();
      let msg = response.statusText;
      try {
        const json = JSON.parse(text);
        if (json.error) msg = json.error;
      } catch {}

      if (response.status === 401 || response.status === 409 || response.status === 429) {
        throw new Error(msg);
      }

      throw new Error(`Server API Error ${response.status}: ${msg}`);
    }

    const data = await response.json();
    return data as GlobalTool;
  } catch (error: any) {
    console.error('Enrichment Service Error:', error);
    const msg = error.name === 'AbortError' ? 'Request timed out' : error.message;

    if (
      msg.includes('Too many requests') ||
      msg.includes('Daily limit reached') ||
      msg.includes('Authentication required') ||
      msg.includes('Enrichment in progress')
    ) {
      throw new Error(msg);
    }

    throw new Error(msg || 'Enrichment failed.');
  }
};
