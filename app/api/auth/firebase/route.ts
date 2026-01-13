import { NextResponse } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getAdminAuth } from '../../../../services/firebaseAdmin';

type AuthRequest = {
  idToken?: string;
};

const buildClaims = (payload: Record<string, unknown>) => {
  const claims: Record<string, unknown> = {};
  if (typeof payload.email === 'string') {
    claims.email = payload.email;
  }
  if (typeof payload.name === 'string') {
    claims.name = payload.name;
  }
  if (typeof payload.email_verified === 'boolean') {
    claims.email_verified = payload.email_verified;
  }
  return claims;
};

export async function POST(request: Request) {
  const adminAuth = getAdminAuth();
  if (!adminAuth) {
    return NextResponse.json(
      { error: 'Server auth is not configured.' },
      { status: 500 }
    );
  }

  let body: AuthRequest = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (!body.idToken) {
    return NextResponse.json({ error: 'Missing Auth0 ID token.' }, { status: 400 });
  }

  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_CLIENT_ID;
  if (!domain || !clientId) {
    return NextResponse.json(
      { error: 'Auth0 is not configured.' },
      { status: 500 }
    );
  }

  const issuer = `https://${domain}/`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}.well-known/jwks.json`));

  try {
    const { payload } = await jwtVerify(body.idToken, jwks, {
      issuer,
      audience: clientId,
    });

    if (typeof payload.sub !== 'string') {
      return NextResponse.json({ error: 'Invalid Auth0 subject.' }, { status: 400 });
    }

    let firebaseUid = payload.sub;
    if (typeof payload.email === 'string' && payload.email.length > 0) {
      try {
        const existing = await adminAuth.getUserByEmail(payload.email);
        firebaseUid = existing.uid;
      } catch (lookupError: any) {
        if (lookupError?.code !== 'auth/user-not-found') {
          console.warn('Auth0 email lookup failed.', lookupError);
        }
      }
    }

    const firebaseToken = await adminAuth.createCustomToken(
      firebaseUid,
      buildClaims(payload as Record<string, unknown>)
    );

    return NextResponse.json({ firebaseToken });
  } catch (error) {
    console.error('Auth0 token verification failed.', error);
    return NextResponse.json({ error: 'Invalid Auth0 token.' }, { status: 401 });
  }
}

