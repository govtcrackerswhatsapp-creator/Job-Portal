import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyCqrCmNWXvd7PzWSUYCugbHMpIIsKLClms',
  authDomain: 'job-portal-b0c35.firebaseapp.com',
  projectId: 'job-portal-b0c35',
  storageBucket: 'job-portal-b0c35.firebasestorage.app',
  messagingSenderId: '912969991257',
  appId: '1:912969991257:web:d9c71c63b6efd504c35d48',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();