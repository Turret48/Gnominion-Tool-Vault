import { auth } from './firebase';

export const addToolToCatalog = async (toolId: string) => {
  if (!auth?.currentUser) {
    throw new Error('Authentication required');
  }

  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/catalog', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ toolId }),
  });

  if (!response.ok) {
    const text = await response.text();
    let msg = response.statusText;
    try {
      const json = JSON.parse(text);
      if (json.error) msg = json.error;
    } catch {}
    throw new Error(msg || 'Failed to add tool to catalog');
  }
};
