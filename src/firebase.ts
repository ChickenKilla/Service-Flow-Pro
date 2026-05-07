import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore,
  CACHE_SIZE_UNLIMITED,
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  serverTimestamp,
  doc,
  getDocFromServer,
  enableMultiTabIndexedDbPersistence
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Initialize Firestore with explicit cache settings for better offline speed
export const db = initializeFirestore(app, {
  cacheSizeBytes: CACHE_SIZE_UNLIMITED,
}, firebaseConfig.firestoreDatabaseId);

// Enable offline persistence with aggressive synchronization
enableMultiTabIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('Multiple tabs open, offline persistence can only be enabled in one tab at a time.');
  } else if (err.code === 'unimplemented') {
    console.warn('The current browser does not support all of the features required to enable offline persistence.');
  }
});

export const googleProvider = new GoogleAuthProvider();

// Standard scopes for basic auth
googleProvider.addScope('email');

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);

// Connection test
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();
