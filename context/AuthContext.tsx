'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../services/firebase';
import { handleAuth0Redirect } from '../services/auth';

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export const AuthProvider = ({ children }: { children?: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | null = null;

    const init = async () => {
      if (!auth) {
        // If firebase isn't initialized, we are just in local mode forever.
        if (isMounted) {
          setLoading(false);
        }
        return;
      }

      try {
        await handleAuth0Redirect();
      } catch (error) {
        console.error('Auth0 redirect handling failed.', error);
      }

      unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        if (!isMounted) return;
        setUser(currentUser);
        setLoading(false);
      });
    };

    init();

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
