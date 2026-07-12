import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, googleProvider } from '../lib/firebase';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { UserProfile } from '../types';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const userRef = doc(db, 'users', firebaseUser.uid);
          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            const data = userSnap.data() as UserProfile;
            // Enforce suspension: a suspended manager is treated as a regular
            // 'user' for access purposes (their stored role stays 'manager' so
            // un-suspending restores it cleanly). Superadmin is never suspended.
            const effective: UserProfile =
              data.role === 'manager' && data.suspended
                ? { ...data, role: 'user' }
                : data;
            setUser(effective);
          } else {
            // First login: check the admin-controlled manager_invites list.
            // If this email was pre-authorized by the superadmin, create them
            // as a 'manager'; otherwise create a normal 'user'. This is a single
            // direct document read (cheapest possible), keyed by email.
            const email = firebaseUser.email || '';
            let invitedAsManager = false;
            if (email) {
              try {
                const inviteSnap = await getDoc(doc(db, 'manager_invites', email));
                invitedAsManager = inviteSnap.exists();
              } catch (e) {
                console.error('AuthContext: manager invite check failed (defaulting to user).', e);
              }
            }

            const newUser: UserProfile = {
              uid: firebaseUser.uid,
              email,
              role: invitedAsManager ? 'manager' : 'user',
              name: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
              subscriptionStatus: 'inactive',
            };
            await setDoc(userRef, newUser);
            setUser(newUser);
          }
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('AuthContext: failed to resolve user profile.', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}