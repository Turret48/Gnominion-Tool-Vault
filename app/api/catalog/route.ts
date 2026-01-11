import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb, adminFieldValue } from '../../../services/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'cloudberrystickers@gmail.com';

const getBearerToken = (request: Request) => {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;

  return token;
};

export async function POST(request: Request) {
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();
  if (!adminAuth || !adminDb) {
    return NextResponse.json(
      { error: 'Server auth is not configured.' },
      { status: 500 }
    );
  }

  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  let decoded: { email?: string; uid?: string };
  try {
    decoded = await adminAuth.verifyIdToken(token);
    if (decoded.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }
  } catch {
    return NextResponse.json(
      { error: 'Invalid or expired authentication token.' },
      { status: 401 }
    );
  }

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const toolId = body?.toolId;
  if (!toolId || typeof toolId !== 'string') {
    return NextResponse.json({ error: 'Tool ID is required.' }, { status: 400 });
  }

  try {
    await adminDb.doc(`tools_catalog/${toolId}`).set(
      {
        toolId,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Catalog add error:', error);
    return NextResponse.json(
      { error: 'Failed to add tool to catalog.' },
      { status: 500 }
    );
  }
}
