import { auth } from './firebase';
import { GlobalTool } from '../types';

export const updateGlobalTool = async (
  toolId: string,
  updates: Partial<GlobalTool>
) => {
  if (!auth?.currentUser) {
    throw new Error('Authentication required');
  }

  const token = await auth.currentUser.getIdToken();
  const response = await fetch(`/api/tools-global/${toolId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ updates }),
  });

  if (!response.ok) {
    const text = await response.text();
    let msg = response.statusText;
    try {
      const json = JSON.parse(text);
      if (json.error) msg = json.error;
    } catch {}
    throw new Error(msg || 'Failed to update global tool');
  }
};
