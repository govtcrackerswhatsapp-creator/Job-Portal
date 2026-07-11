import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyAgaszyRdQWcOhk9qk82n1VGwNI75hBuW4',
  authDomain: 'sublime-city-0wjrd.firebaseapp.com',
  projectId: 'sublime-city-0wjrd',
  storageBucket: 'sublime-city-0wjrd.firebasestorage.app',
  messagingSenderId: '821556501975',
  appId: '1:821556501975:web:6115d10ed02a013f5f7f92',
};

// This project uses a NAMED Firestore database (not the default), so we pass its ID.
const DATABASE_ID = 'ai-studio-minimalistperson-aa9647b6-689d-4f43-b782-4c3b45213680';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, DATABASE_ID);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();