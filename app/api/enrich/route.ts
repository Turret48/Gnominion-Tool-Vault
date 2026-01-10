import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { NextResponse } from 'next/server';
import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb, adminFieldValue } from '../../../services/firebaseAdmin';
import {
  normalizeTextAlias,
  normalizeUrl,
  getRootDomain,
  looksLikeUrl,
} from '../../../services/toolIdentity';
import { computeToolId } from '../../../services/toolIdentityServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_DAILY_LIMIT = 50;
const DEFAULT_MINUTE_LIMIT = 4;
const ENRICH_VERSION = 1;

const logEnrich = (label: string, meta: Record<string, string> = {}) => {
  const context = Object.entries(meta)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  console.log(`[enrich] ${label}${context ? ` ${context}` : ''}`);
};
const STALE_DAYS = 30;
const LOCK_MS = 2 * 60 * 1000;

const getBearerToken = (request: Request) => {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;

  return token;
};

const getDailyLimit = () => {
  const rawLimit = process.env.ENRICH_DAILY_LIMIT;
  if (!rawLimit) return DEFAULT_DAILY_LIMIT;

  const parsed = Number.parseInt(rawLimit, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_LIMIT;
};

const getMinuteLimit = () => {
  const rawLimit = process.env.ENRICH_MINUTE_LIMIT;
  if (!rawLimit) return DEFAULT_MINUTE_LIMIT;

  const parsed = Number.parseInt(rawLimit, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MINUTE_LIMIT;
};

const toMillis = (value?: Timestamp | Date | number) => {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if ('toMillis' in value) return value.toMillis();
  return null;
};

const isStale = (data: any) => {
  if (!data) return true;
  if (data.enrichVersion !== ENRICH_VERSION) return true;
  const enrichedAt = toMillis(data.enrichedAt);
  if (!enrichedAt) return true;
  const ageMs = Date.now() - enrichedAt;
  return ageMs > STALE_DAYS * 24 * 60 * 60 * 1000;
};

const lockExpired = (data: any) => {
  const expiresAt = toMillis(data?.lockExpiresAt);
  return !expiresAt || expiresAt <= Date.now();
};

const getDailyKey = () => new Date().toISOString().slice(0, 10);
const getMinuteKey = () => new Date().toISOString().slice(0, 16).replace(':', '');

const enforceDailyLimit = async (db: Firestore, userId: string) => {
  const limit = getDailyLimit();
  const dateKey = getDailyKey();
  const usageRef = db.doc(`users/${userId}/usage_daily/${dateKey}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(usageRef);
    const count = snap.exists ? Number(snap.data()?.count ?? 0) : 0;

    if (count >= limit) {
      const err = new Error('RATE_LIMIT_DAILY');
      (err as { code?: string }).code = 'RATE_LIMIT_DAILY';
      throw err;
    }

    tx.set(
      usageRef,
      {
        count: count + 1,
        updatedAt: adminFieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
};

const enforceMinuteLimit = async (db: Firestore, userId: string) => {
  const limit = getMinuteLimit();
  const minuteKey = getMinuteKey();
  const usageRef = db.doc(`users/${userId}/usage_minute/${minuteKey}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(usageRef);
    const count = snap.exists ? Number(snap.data()?.count ?? 0) : 0;

    if (count >= limit) {
      const err = new Error('RATE_LIMIT_MINUTE');
      (err as { code?: string }).code = 'RATE_LIMIT_MINUTE';
      throw err;
    }

    tx.set(
      usageRef,
      {
        count: count + 1,
        updatedAt: adminFieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
};

const buildAliases = (aliasInputs: string[]) => {
  const aliases = new Set<string>();
  aliasInputs.forEach((alias) => {
    const normalized = normalizeTextAlias(alias);
    if (normalized) aliases.add(normalized);
  });
  return Array.from(aliases);
};

const normalizeGlobalToolResponse = (toolId: string, data: any) => {
  return {
    toolId,
    canonicalUrl: data.canonicalUrl || '',
    normalizedUrl: data.normalizedUrl || '',
    rootDomain: data.rootDomain || '',
    name: data.name || '',
    summary: data.summary || '',
    bestUseCases: data.bestUseCases || [],
    category: data.category || 'Other',
    tags: data.tags || [],
    integrations: data.integrations || [],
    pricingBucket: data.pricingBucket || 'Unknown',
    pricingNotes: data.pricingNotes || '',
    logoUrl: data.logoUrl || '',
    websiteUrl: data.websiteUrl || data.canonicalUrl || '',
    whatItDoes: data.whatItDoes || '',
    status: data.status || 'ready',
    enrichedAt: toMillis(data.enrichedAt) || null,
    enrichVersion: data.enrichVersion ?? ENRICH_VERSION,
    aliases: data.aliases || [],
  };
};

const getCachedTool = async (db: Firestore, toolId: string) => {
  const docRef = db.doc(`tools_global/${toolId}`);
  const snap = await docRef.get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (data?.status === 'ready' && !isStale(data)) {
    return normalizeGlobalToolResponse(toolId, data);
  }
  return null;
};

const lockTool = async (db: Firestore, toolId: string) => {
  const docRef = db.doc(`tools_global/${toolId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const data = snap.exists ? snap.data() : null;

    if (data?.status === 'enriching' && !lockExpired(data)) {
      return { ok: false, reason: 'LOCKED' };
    }

    tx.set(
      docRef,
      {
        status: 'enriching',
        lockExpiresAt: new Date(Date.now() + LOCK_MS),
        updatedAt: adminFieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { ok: true };
  });
};

const enrichWithGemini = async (input: string, availableCategories: string[]) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-2.5-flash';

  const categoriesList = availableCategories
    ? availableCategories.join(', ')
    : 'General';

  const systemInstruction = `You are an expert software directory curator.
Analyze the software tool based on the user input: "${input}".

If the input is a URL, assume the tool located at that URL.
If it's a name, use your internal knowledge.

Provide a structured analysis suitable for a personal knowledge base.

IMPORTANT - Categorization Rules:
- You MUST strictly select one category from the following list: [${categoriesList}].
- Choose the one that fits best. If absolutely nothing fits, select 'Other'.

Also return the official website URL when possible.`;

  const response = await ai.models.generateContent({
    model: modelName,
    contents: input,
    config: {
      systemInstruction: systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          summary: { type: Type.STRING },
          bestUseCases: { type: Type.ARRAY, items: { type: Type.STRING } },
          category: { type: Type.STRING },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } },
          integrations: { type: Type.ARRAY, items: { type: Type.STRING } },
          pricingBucket: {
            type: Type.STRING,
            enum: ['Free', 'Freemium', 'Paid', 'Enterprise', 'Unknown'],
          },
          pricingNotes: { type: Type.STRING },
          whatItDoes: { type: Type.STRING },
          logoUrl: { type: Type.STRING },
          websiteUrl: { type: Type.STRING },
        },
        required: [
          'name',
          'summary',
          'bestUseCases',
          'category',
          'tags',
          'pricingBucket',
        ],
      },
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
      ],
    },
  });

  const text = response.text;
  if (!text) throw new Error('No response text');
  return JSON.parse(text);
};

export async function POST(request: Request) {
  if (!process.env.API_KEY) {
    return NextResponse.json(
      { error: 'API_KEY is missing from server environment.' },
      { status: 500 }
    );
  }

  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();
  if (!adminAuth || !adminDb) {
    return NextResponse.json(
      { error: 'Server auth is not configured. Missing Firebase Admin credentials.' },
      { status: 500 }
    );
  }

  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  let userId: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    userId = decoded.uid;
  } catch {
    return NextResponse.json(
      { error: 'Invalid or expired authentication token.' },
      { status: 401 }
    );
  }

  try {
    await enforceMinuteLimit(adminDb, userId);
    await enforceDailyLimit(adminDb, userId);
  } catch (error: any) {
    if (error?.code === 'RATE_LIMIT_MINUTE') {
      return NextResponse.json(
        { error: 'Too many requests. Try again in a minute.' },
        { status: 429 }
      );
    }

    if (error?.code === 'RATE_LIMIT_DAILY') {
      return NextResponse.json(
        { error: 'Daily limit reached. Try again tomorrow.' },
        { status: 429 }
      );
    }

    console.error('Usage limit error:', error);
    return NextResponse.json(
      { error: 'Unable to verify usage limits.' },
      { status: 500 }
    );
  }

  try {
    const { input, availableCategories } = await request.json();

    if (!input) {
      return NextResponse.json({ error: 'Input is required' }, { status: 400 });
    }

    const isUrlInput = looksLikeUrl(input);

    if (isUrlInput) {
      const normalizedUrl = normalizeUrl(input);
      const hostname = new URL(normalizedUrl).hostname;
      const rootDomain = getRootDomain(hostname);
      const toolId = computeToolId(rootDomain);

      const cached = await getCachedTool(adminDb, toolId);
      if (cached) {
        logEnrich('cache_hit', { toolId, rootDomain });
        return NextResponse.json(cached);
      }

      const lock = await lockTool(adminDb, toolId);
      if (!lock.ok) {
        logEnrich('cache_busy', { toolId, rootDomain });
        return NextResponse.json(
          { error: 'Enrichment in progress. Try again shortly.' },
          { status: 409 }
        );
      }

      logEnrich('gemini_call', { toolId, rootDomain });
      const enriched = await enrichWithGemini(input, availableCategories || []);
      const canonicalUrl = enriched.websiteUrl
        ? normalizeUrl(enriched.websiteUrl)
        : normalizedUrl;

      const aliases = buildAliases([
        input,
        rootDomain,
        `www.${rootDomain}`,
        normalizedUrl,
      ]);

      const payload = {
        toolId,
        canonicalUrl,
        normalizedUrl,
        rootDomain,
        name: enriched.name,
        summary: enriched.summary,
        bestUseCases: enriched.bestUseCases || [],
        category: enriched.category || 'Other',
        tags: enriched.tags || [],
        integrations: enriched.integrations || [],
        pricingBucket: enriched.pricingBucket || 'Unknown',
        pricingNotes: enriched.pricingNotes || '',
        logoUrl: enriched.logoUrl || '',
        websiteUrl: enriched.websiteUrl || canonicalUrl,
        whatItDoes: enriched.whatItDoes || '',
        status: 'ready',
        enrichedAt: adminFieldValue.serverTimestamp(),
        enrichVersion: ENRICH_VERSION,
        aliases,
        lockExpiresAt: null,
      };

      await adminDb.doc(`tools_global/${toolId}`).set(payload, { merge: true });
      return NextResponse.json(normalizeGlobalToolResponse(toolId, payload));
    }

    const alias = normalizeTextAlias(input);
    if (alias) {
      const aliasSnap = await adminDb
        .collection('tools_global')
        .where('aliases', 'array-contains', alias)
        .limit(1)
        .get();

      if (!aliasSnap.empty) {
        const docSnap = aliasSnap.docs[0];
        const data = docSnap.data();
        if (data?.status === 'ready' && !isStale(data)) {
          logEnrich('cache_hit', { toolId: docSnap.id, alias });
          return NextResponse.json(
            normalizeGlobalToolResponse(docSnap.id, data)
          );
        }
        if (data?.status === 'enriching' && !lockExpired(data)) {
          logEnrich('cache_busy', { toolId: docSnap.id, alias });
          return NextResponse.json(
            { error: 'Enrichment in progress. Try again shortly.' },
            { status: 409 }
          );
        }
      }
    }

    logEnrich('gemini_call', { alias: alias || 'unknown' });
    const enriched = await enrichWithGemini(input, availableCategories || []);
    if (!enriched.websiteUrl) {
      return NextResponse.json(
        { error: 'Unable to resolve official website for this tool.' },
        { status: 422 }
      );
    }

    const canonicalUrl = normalizeUrl(enriched.websiteUrl);
    const hostname = new URL(canonicalUrl).hostname;
    const rootDomain = getRootDomain(hostname);
    const toolId = computeToolId(rootDomain);

    const cached = await getCachedTool(adminDb, toolId);
    if (cached) {
      return NextResponse.json(cached);
    }

    const aliases = buildAliases([
      input,
      alias,
      rootDomain,
      `www.${rootDomain}`,
      canonicalUrl,
    ]);

    const payload = {
      toolId,
      canonicalUrl,
      normalizedUrl: canonicalUrl,
      rootDomain,
      name: enriched.name,
      summary: enriched.summary,
      bestUseCases: enriched.bestUseCases || [],
      category: enriched.category || 'Other',
      tags: enriched.tags || [],
      integrations: enriched.integrations || [],
      pricingBucket: enriched.pricingBucket || 'Unknown',
      pricingNotes: enriched.pricingNotes || '',
      logoUrl: enriched.logoUrl || '',
      websiteUrl: enriched.websiteUrl || canonicalUrl,
      whatItDoes: enriched.whatItDoes || '',
      status: 'ready',
      enrichedAt: adminFieldValue.serverTimestamp(),
      enrichVersion: ENRICH_VERSION,
      aliases,
      lockExpiresAt: null,
    };

    await adminDb.doc(`tools_global/${toolId}`).set(payload, { merge: true });
    return NextResponse.json(normalizeGlobalToolResponse(toolId, payload));
  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return NextResponse.json(
      { error: 'Failed to enrich data via AI', details: error.message },
      { status: 500 }
    );
  }
}
