import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, deleteDoc, writeBatch, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Authentication & Firestore
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Standard OAuth Setup: googleProvider custom parameters
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export { signInWithPopup, signOut, onAuthStateChanged };
export type { User };

// Test connection constraint as required by firebase-integration skill
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firebase offline mode is active (can be ignored in local development).", error.message);
    }
  }
}

// Invoke the connection test silently on load
testConnection().catch(err => console.warn('Firebase silent test connection:', err));

// Firestore sync services
export interface FirestoreTask {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
  userId: string;
}

export interface FirestoreFocusLog {
  day: string;
  level: 'none' | 'low' | 'medium' | 'high';
  note: string;
  userId: string;
  updatedAt: number;
}

export interface UserProfile {
  displayName: string;
  email: string;
  photoURL: string;
  singularFocus?: string;
  updatedAt: number;
}

/**
 * Save user profile to Firestore
 */
export async function saveUserProfile(userId: string, profile: Partial<UserProfile>) {
  try {
    const userRef = doc(db, 'users', userId);
    const existing = await getDoc(userRef);
    const currentData = existing.exists() ? existing.data() as UserProfile : null;
    
    const updatedData: UserProfile = {
      displayName: profile.displayName || currentData?.displayName || 'Friend',
      email: profile.email || currentData?.email || '',
      photoURL: profile.photoURL || currentData?.photoURL || '',
      singularFocus: profile.singularFocus !== undefined ? profile.singularFocus : (currentData?.singularFocus || ''),
      updatedAt: Date.now()
    };

    await setDoc(userRef, updatedData);
  } catch (err) {
    console.error('Error saving user profile:', err);
  }
}

/**
 * Get user profile from Firestore
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
  } catch (err) {
    console.error('Error getting user profile:', err);
  }
  return null;
}

/**
 * Fetch tasks from Firestore for a specific user
 */
export async function fetchFirestoreTasks(userId: string): Promise<FirestoreTask[]> {
  try {
    const q = query(collection(db, 'users', userId, 'tasks'));
    const querySnapshot = await getDocs(q);
    const tasks: FirestoreTask[] = [];
    querySnapshot.forEach((doc) => {
      tasks.push(doc.data() as FirestoreTask);
    });
    return tasks.sort((a, b) => b.createdAt - a.createdAt);
  } catch (err) {
    console.error('Error fetching tasks:', err);
    return [];
  }
}

/**
 * Save tasks batch or single task to Firestore
 */
export async function saveFirestoreTask(userId: string, task: Omit<FirestoreTask, 'userId'>) {
  try {
    const taskRef = doc(db, 'users', userId, 'tasks', task.id);
    await setDoc(taskRef, {
      ...task,
      userId
    });
  } catch (err) {
    console.error('Error saving task:', err);
  }
}

/**
 * Delete a task from Firestore
 */
export async function deleteFirestoreTask(userId: string, taskId: string) {
  try {
    const taskRef = doc(db, 'users', userId, 'tasks', taskId);
    await deleteDoc(taskRef);
  } catch (err) {
    console.error('Error deleting task:', err);
  }
}

/**
 * Batch upload offline local tasks to firestore upon first login
 */
export async function uploadLocalTasksBatch(userId: string, tasks: any[]) {
  try {
    const batch = writeBatch(db);
    tasks.forEach((task) => {
      const taskRef = doc(db, 'users', userId, 'tasks', task.id);
      batch.set(taskRef, {
        id: task.id,
        text: task.text,
        completed: task.completed,
        createdAt: task.createdAt,
        userId
      });
    });
    await batch.commit();
  } catch (err) {
    console.error('Batch upload tasks error:', err);
  }
}

/**
 * Fetch focus logs from Firestore
 */
export async function fetchFirestoreFocusLogs(userId: string): Promise<FirestoreFocusLog[]> {
  try {
    const q = query(collection(db, 'users', userId, 'focusLogs'));
    const querySnapshot = await getDocs(q);
    const logs: FirestoreFocusLog[] = [];
    querySnapshot.forEach((doc) => {
      logs.push(doc.data() as FirestoreFocusLog);
    });
    return logs;
  } catch (err) {
    console.error('Error fetching focus logs:', err);
    return [];
  }
}

/**
 * Save a single focus log to Firestore
 */
export async function saveFirestoreFocusLog(userId: string, log: Omit<FirestoreFocusLog, 'userId'>) {
  try {
    const logRef = doc(db, 'users', userId, 'focusLogs', log.day);
    await setDoc(logRef, {
      ...log,
      userId
    });
  } catch (err) {
    console.error('Error saving focus log:', err);
  }
}

/**
 * Batch upload offline focus logs to firestore upon first login
 */
export async function uploadLocalFocusLogsBatch(userId: string, logs: any[]) {
  try {
    const batch = writeBatch(db);
    logs.forEach((log) => {
      const logRef = doc(db, 'users', userId, 'focusLogs', log.day);
      batch.set(logRef, {
        day: log.day,
        level: log.level,
        note: log.note || '',
        userId,
        updatedAt: Date.now()
      });
    });
    await batch.commit();
  } catch (err) {
    console.error('Batch upload focus logs error:', err);
  }
}
