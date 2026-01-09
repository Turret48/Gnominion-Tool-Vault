#!/usr/bin/env node

const admin = require('firebase-admin');
const crypto = require('crypto');

const args = process.argv.slice(2);
const emailFlagIndex = args.indexOf('--email');
const email = emailFlagIndex >= 0 ? args[emailFlagIndex + 1] : null;

if (!email) {
  console.error('Usage: node scripts/migrate_user_tools.js --email user@example.com');
  process.exit(1);
}

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('GOOGLE_APPLICATION_CREDENTIALS is not set.');
  console.error('Set it to your service account JSON path before running.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();
const auth = admin.auth();

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'msclkid',
  'yclid',
  'igshid',
  'mc_eid',
]);

const normalizeTextAlias = (input) => {
  return String(input || '').trim().toLowerCase().replace(/\s+/g, ' ');
};

const normalizeUrl = (input) => {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withScheme);

  url.hostname = url.hostname.toLowerCase();
  if (url.hostname.startsWith('www.')) {
    url.hostname = url.hostname.slice(4);
  }

  if (url.pathname === '/') {
    url.pathname = '';
  }

  const params = new URLSearchParams(url.search);
  params.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower.startsWith('utm_') || TRACKING_PARAMS.has(lower)) {
      params.delete(key);
    }
  });

  const entries = [];
  params.forEach((value, key) => entries.push([key, value]));
  entries.sort((a, b) => a[0].localeCompare(b[0]));

  const sorted = new URLSearchParams();
  entries.forEach(([key, value]) => sorted.append(key, value));

  const query = sorted.toString();
  return `${url.protocol}//${url.hostname}${url.pathname}${query ? `?${query}` : ''}`;
};

const getRootDomain = (hostname) => {
  const lower = String(hostname || '').toLowerCase();
  return lower.startsWith('www.') ? lower.slice(4) : lower;
};

const computeToolId = (input) => {
  return crypto.createHash('sha256').update(input).digest('hex');
};

const buildAliases = (values) => {
  const set = new Set();
  values.forEach((value) => {
    const alias = normalizeTextAlias(value);
    if (alias) set.add(alias);
  });
  return Array.from(set);
};

const migrate = async () => {
  const userRecord = await auth.getUserByEmail(email);
  const uid = userRecord.uid;

  const legacyRef = db.collection('users').doc(uid).collection('tools');
  const legacySnap = await legacyRef.get();

  if (legacySnap.empty) {
    console.log('No legacy tools found.');
    return;
  }

  let migrated = 0;
  for (const doc of legacySnap.docs) {
    const tool = doc.data();
    const name = tool.name || doc.id;
    const url = tool.url || '';
    const normalizedUrl = normalizeUrl(url);

    let toolId = '';
    let rootDomain = '';
    let canonicalUrl = '';

    if (normalizedUrl) {
      const hostname = new URL(normalizedUrl).hostname;
      rootDomain = getRootDomain(hostname);
      toolId = computeToolId(rootDomain);
      canonicalUrl = normalizedUrl;
    } else {
      const alias = normalizeTextAlias(name);
      toolId = computeToolId(`name:${alias}`);
    }

    const aliases = buildAliases([
      name,
      url,
      normalizedUrl,
      rootDomain,
      rootDomain ? `www.${rootDomain}` : '',
    ]);

    const globalPayload = {
      toolId,
      canonicalUrl: canonicalUrl || '',
      normalizedUrl: normalizedUrl || '',
      rootDomain: rootDomain || '',
      name: tool.name || name || '',
      summary: tool.summary || '',
      bestUseCases: tool.bestUseCases || [],
      category: tool.category || 'Other',
      tags: tool.tags || [],
      integrations: tool.integrations || [],
      pricingBucket: tool.pricingBucket || 'Unknown',
      pricingNotes: tool.pricingNotes || '',
      logoUrl: tool.logoUrl || '',
      websiteUrl: url || canonicalUrl || '',
      whatItDoes: tool.notes?.whatItDoes || '',
      status: 'ready',
      enrichedAt: admin.firestore.FieldValue.serverTimestamp(),
      enrichVersion: 1,
      aliases,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const userPayload = {
      toolId,
      status: tool.status || 'Interested',
      notes: tool.notes || {
        whatItDoes: '',
        whenToUse: '',
        howToUse: '',
        gotchas: '',
        links: '',
      },
      tags: tool.tags || [],
      category: tool.category || 'Other',
      createdAt: tool.createdAt || Date.now(),
      updatedAt: tool.updatedAt || Date.now(),
    };

    await db.doc(`tools_global/${toolId}`).set(globalPayload, { merge: true });
    await db
      .doc(`users/${uid}/saved_tools/${toolId}`)
      .set(userPayload, { merge: true });

    migrated += 1;
  }

  console.log(`Migrated ${migrated} tools for ${email}.`);
};

migrate().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
