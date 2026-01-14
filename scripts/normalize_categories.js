const admin = require('firebase-admin');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('GOOGLE_APPLICATION_CREDENTIALS is not set.');
  console.error('Set it to your service account JSON path before running.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

const MAX_CATEGORY_LENGTH = 26;
const DEFAULT_CATEGORIES = [
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

const CATEGORY_SYNONYMS = {
  'dev tools': 'Development',
  'devtools': 'Development',
  'knowledge base': 'Notes',
  'knowledgebase': 'Notes',
  'docs': 'Notes',
  'documentation': 'Notes',
  'doc': 'Notes',
  'email': 'CRM',
  'data': 'Analytics',
  'backend': 'Backends',
  'back end': 'Backends',
  'infrastructure': 'Backends',
  'other': 'Productivity',
};

const DEFAULT_CATEGORY_LOOKUP = new Map(
  DEFAULT_CATEGORIES.map((cat) => [cat.toLowerCase(), cat])
);

const normalizeCategory = (cat) => {
  const trimmed = String(cat || '').trim().slice(0, MAX_CATEGORY_LENGTH);
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  return CATEGORY_SYNONYMS[lower] || DEFAULT_CATEGORY_LOOKUP.get(lower) || trimmed;
};

const normalizeCategories = (cats) => {
  const set = new Set();
  (cats || []).forEach((cat) => {
    const normalized = normalizeCategory(cat);
    if (normalized) set.add(normalized);
  });
  return Array.from(set).sort();
};

const updateInBatches = async (updates) => {
  const chunks = [];
  for (let i = 0; i < updates.length; i += 400) {
    chunks.push(updates.slice(i, i + 400));
  }

  for (const chunk of chunks) {
    if (dryRun) continue;
    const batch = db.batch();
    chunk.forEach(({ ref, data }) => batch.set(ref, data, { merge: true }));
    await batch.commit();
  }
};

const normalizeGlobalTools = async () => {
  const snap = await db.collection('tools_global').get();
  const updates = [];
  let changed = 0;

  snap.forEach((doc) => {
    const data = doc.data();
    const normalized = normalizeCategory(data.category || 'Productivity');
    if (normalized && normalized !== data.category) {
      updates.push({ ref: doc.ref, data: { category: normalized } });
      changed += 1;
    }
  });

  await updateInBatches(updates);
  return { total: snap.size, changed };
};

const normalizeUserCategories = async () => {
  const snap = await db.collection('users').get();
  const updates = [];
  let changed = 0;

  snap.forEach((doc) => {
    const data = doc.data();
    const existing = Array.isArray(data.categories) ? data.categories : [];
    const normalized = existing.length ? normalizeCategories(existing) : DEFAULT_CATEGORIES;
    const same = JSON.stringify(existing) === JSON.stringify(normalized);
    if (!same) {
      updates.push({ ref: doc.ref, data: { categories: normalized } });
      changed += 1;
    }
  });

  await updateInBatches(updates);
  return { total: snap.size, changed };
};

const normalizeUserTools = async () => {
  const usersSnap = await db.collection('users').get();
  let totalUsers = 0;
  let toolUpdates = 0;
  let toolTotal = 0;

  for (const userDoc of usersSnap.docs) {
    totalUsers += 1;
    const toolsSnap = await userDoc.ref.collection('saved_tools').get();
    toolTotal += toolsSnap.size;
    const updates = [];

    toolsSnap.forEach((toolDoc) => {
      const data = toolDoc.data();
      const normalized = normalizeCategory(data.category || 'Productivity');
      if (normalized && normalized !== data.category) {
        updates.push({ ref: toolDoc.ref, data: { category: normalized } });
        toolUpdates += 1;
      }
    });

    await updateInBatches(updates);
  }

  return { users: totalUsers, total: toolTotal, changed: toolUpdates };
};

const run = async () => {
  console.log(dryRun ? 'Running in dry-run mode.' : 'Running in write mode.');

  const globalResult = await normalizeGlobalTools();
  console.log(`tools_global: ${globalResult.changed}/${globalResult.total} updated`);

  const userCategoriesResult = await normalizeUserCategories();
  console.log(`users.categories: ${userCategoriesResult.changed}/${userCategoriesResult.total} updated`);

  const userToolsResult = await normalizeUserTools();
  console.log(`saved_tools: ${userToolsResult.changed}/${userToolsResult.total} updated (across ${userToolsResult.users} users)`);

  if (dryRun) {
    console.log('Dry run complete. No writes performed.');
  } else {
    console.log('Normalization complete.');
  }
};

run().catch((error) => {
  console.error('Normalization failed:', error);
  process.exit(1);
});
