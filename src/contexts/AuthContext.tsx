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
            // First login: check the admin-controlled invite lists.
            // 1) manager_invites  -> create as 'manager'  (unchanged; keyed by the raw email)
            // 2) free_access_invites -> create as 'user' WITH pre-granted access
            //    (permanent free access, or a time-limited subscription).
            // These are cheap direct document reads done only on first login.
            const email = firebaseUser.email || '';
            let invitedAsManager = false;
            let freeInvite: any = null;
            if (email) {
              try {
                const inviteSnap = await getDoc(doc(db, 'manager_invites', email));
                invitedAsManager = inviteSnap.exists();
              } catch (e) {
                console.error('AuthContext: manager invite check failed (defaulting to user).', e);
              }
              // Only check free-access invites if they are NOT a manager (managers already have full access).
              // Free-access invites are stored keyed by LOWERCASE email (see the admin grant-by-email tool),
              // so we look them up by the lowercased email to avoid any casing mismatch.
              if (!invitedAsManager) {
                try {
                  const freeSnap = await getDoc(doc(db, 'free_access_invites', email.toLowerCase()));
                  if (freeSnap.exists()) freeInvite = freeSnap.data();
                } catch (e) {
                  console.error('AuthContext: free-access invite check failed (defaulting to no grant).', e);
                }
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

            // Apply a pre-granted free-access invite (only for non-managers).
            if (freeInvite) {
              const now = Date.now();
              const label = typeof freeInvite.planName === 'string' && freeInvite.planName.trim()
                ? freeInvite.planName.trim()
                : (freeInvite.type === 'timed' ? 'Manual Grant' : 'Free Access');
              if (freeInvite.type === 'timed') {
                const days = Number(freeInvite.days) > 0 ? Number(freeInvite.days) : 30;
                newUser.subscriptionStatus = 'active';
                newUser.subscriptionExpiry = now + days * 24 * 60 * 60 * 1000;
                newUser.subscriptionStart = now;
                newUser.planName = label;
              } else {
                // permanent free access
                newUser.freeAccess = true;
                newUser.subscriptionStart = now;
                newUser.planName = label;
              }
            }

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