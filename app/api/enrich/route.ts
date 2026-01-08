import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { NextResponse } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb, adminFieldValue } from '../../../services/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


const DEFAULT_DAILY_LIMIT = 50;
const DEFAULT_MINUTE_LIMIT = 4;

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

const enforceDailyLimit = async (db: Firestore, userId: string) => {
  const limit = getDailyLimit();
  const dateKey = new Date().toISOString().slice(0, 10);
  const usageRef = db.doc(`users/${userId}/usage_daily/${dateKey}`);

  try {
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
  } catch (error: any) {
    if (error?.code === 'RATE_LIMIT_DAILY' || error?.message === 'RATE_LIMIT_DAILY') {
      throw error;
    }
    throw error;
  }
};

const enforceMinuteLimit = async (db: Firestore, userId: string) => {
  const limit = getMinuteLimit();
  const now = new Date();
  const minuteKey = now.toISOString().slice(0, 16).replace(':', '');
  const usageRef = db.doc(`users/${userId}/usage_minute/${minuteKey}`);

  try {
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
  } catch (error: any) {
    if (error?.code === 'RATE_LIMIT_MINUTE' || error?.message === 'RATE_LIMIT_MINUTE') {
      throw error;
    }
    throw error;
  }
};

export async function POST(request: Request) {
  if (!process.env.API_KEY) {
    return NextResponse.json(
      { error: "API_KEY is missing from server environment." },
      { status: 500 }
    );
  }

  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();
  if (!adminAuth || !adminDb) {
    return NextResponse.json(
      { error: "Server auth is not configured. Missing Firebase Admin credentials." },
      { status: 500 }
    );
  }

  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  let userId: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    userId = decoded.uid;
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired authentication token." },
      { status: 401 }
    );
  }

  try {
    await enforceMinuteLimit(adminDb, userId);
    await enforceDailyLimit(adminDb, userId);
  } catch (error: any) {
    if (error?.code === 'RATE_LIMIT_MINUTE' || error?.message === 'RATE_LIMIT_MINUTE') {
      return NextResponse.json(
        { error: "Too many requests. Try again in a minute." },
        { status: 429 }
      );
    }

    if (error?.code === 'RATE_LIMIT_DAILY' || error?.message === 'RATE_LIMIT_DAILY') {
      return NextResponse.json(
        { error: "Daily limit reached. Try again tomorrow." },
        { status: 429 }
      );
    }

    console.error("Usage limit error:", error);
    return NextResponse.json(
      { error: "Unable to verify usage limits." },
      { status: 500 }
    );
  }

  try {
    const { input, availableCategories } = await request.json();

    if (!input) {
      return NextResponse.json({ error: "Input is required" }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const modelName = 'gemini-2.5-flash';

    const categoriesList = availableCategories ? availableCategories.join(', ') : "General";

    const systemInstruction = `You are an expert software directory curator. 
Analyze the software tool based on the user input: "${input}".

If the input is a URL, assume the tool located at that URL. 
If it's a name, use your internal knowledge.

Provide a structured analysis suitable for a personal knowledge base.

IMPORTANT - Categorization Rules:
- You MUST strictly select one category from the following list: [${categoriesList}].
- Choose the one that fits best. If absolutely nothing fits, select 'Other'.`;

    const response = await ai.models.generateContent({
        model: modelName,
        contents: input,
        config: {
            systemInstruction: systemInstruction,
            responseMimeType: "application/json",
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
                        enum: ['Free', 'Freemium', 'Paid', 'Enterprise', 'Unknown'] 
                    },
                    pricingNotes: { type: Type.STRING },
                    whatItDoes: { type: Type.STRING },
                    logoUrl: { type: Type.STRING },
                    websiteUrl: { type: Type.STRING }
                },
                required: ["name", "summary", "bestUseCases", "category", "tags", "pricingBucket"],
            },
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            ],
        }
    });

    const text = response.text;
    if (!text) throw new Error("No response text");
    const data = JSON.parse(text);
    return NextResponse.json(data);

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return NextResponse.json(
      { error: "Failed to enrich data via AI", details: error.message },
      { status: 500 }
    );
  }
}
