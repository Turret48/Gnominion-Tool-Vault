import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  User,
  signInWithCustomToken,
  updateProfile
} from "firebase/auth";
import { auth } from "./firebase";
import { getAuth0Client } from "./auth0Client";

const googleProvider = new GoogleAuthProvider();
// Force account selection to prevent "popup closed immediately" errors
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

const requireFirebaseAuth = () => {
  if (!auth) {
    throw new Error("Authentication service is not configured (missing Firebase keys).");
  }
  return auth;
};

const hasAuth0RedirectParams = () => {
  if (typeof window === 'undefined') return false;
  const search = window.location.search;
  return search.includes('code=') && search.includes('state=');
};

export const signInWithGoogle = async (): Promise<User> => {
  const firebaseAuth = requireFirebaseAuth();
  try {
    const result = await signInWithPopup(firebaseAuth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

export const signInWithAuth0 = async () => {
  const auth0 = await getAuth0Client();
  if (!auth0) {
    throw new Error('Auth0 is not configured.');
  }

  await auth0.loginWithRedirect({
    authorizationParams: {
      redirect_uri: window.location.origin,
    }
  });
};

export const handleAuth0Redirect = async (): Promise<User | null> => {
  if (!auth || !hasAuth0RedirectParams()) return null;

  const auth0 = await getAuth0Client();
  if (!auth0) return null;

  await auth0.handleRedirectCallback();

  const claims = await auth0.getIdTokenClaims();
  const idToken = claims?.__raw;
  if (!idToken) {
    throw new Error('Missing Auth0 ID token.');
  }

  const response = await fetch('/api/auth/firebase', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Failed to exchange Auth0 token.');
  }

  const data = await response.json();
  if (!data.firebaseToken) {
    throw new Error('Missing Firebase token.');
  }

  const firebaseAuth = requireFirebaseAuth();
  await signInWithCustomToken(firebaseAuth, data.firebaseToken);

  try {
    const auth0User = await auth0.getUser();
    const displayName = auth0User?.preferred_username || auth0User?.nickname || auth0User?.name;
    if (displayName && firebaseAuth.currentUser && firebaseAuth.currentUser.displayName !== displayName) {
      await updateProfile(firebaseAuth.currentUser, { displayName });
    }
  } catch (error) {
    console.warn('Failed to sync display name from Auth0.', error);
  }

  window.history.replaceState({}, document.title, window.location.pathname);
  return firebaseAuth.currentUser;
};

export const logOut = async () => {
  if (!auth) return;
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
    throw error;
  }

  const auth0 = await getAuth0Client();
  if (auth0) {
    try {
      await auth0.logout({
        logoutParams: { returnTo: window.location.origin }
      });
    } catch (error) {
      console.error('Error signing out of Auth0', error);
    }
  }
};

