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

export async function PATCH(
  request: Request,
  { params }: { params: { toolId: string } }
) {
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

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (decoded.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }
  } catch {
    return NextResponse.json(
      { error: 'Invalid or expired authentication token.' },
      { status: 401 }
    );
  }

  const toolId = params.toolId;
  if (!toolId) {
    return NextResponse.json({ error: 'Tool ID is required.' }, { status: 400 });
  }

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const updates = body?.updates;
  if (!updates || typeof updates !== 'object') {
    return NextResponse.json({ error: 'Missing updates payload.' }, { status: 400 });
  }

  const allowedFields = new Set([
    'name',
    'summary',
    'bestUseCases',
    'integrations',
    'pricingBucket',
    'pricingNotes',
    'logoUrl',
    'websiteUrl',
    'whatItDoes',
    'category',
    'tags',
    'canonicalUrl',
    'normalizedUrl',
    'rootDomain',
  ]);

  const sanitized: Record<string, any> = {};
  Object.keys(updates).forEach((key) => {
    if (allowedFields.has(key)) {
      sanitized[key] = updates[key];
    }
  });

  if (Object.keys(sanitized).length == 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  try {
    await adminDb.doc(`tools_global/${toolId}`).set(
      {
        ...sanitized,
        updatedAt: adminFieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Admin tool update error:', error);
    return NextResponse.json(
      { error: 'Failed to update global tool.' },
      { status: 500 }
    );
  }
}
