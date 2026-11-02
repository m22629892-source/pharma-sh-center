import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc, setLogLevel } from 'firebase/firestore';
import defaultConfig from './firebase-applet-config.json';

export const firebaseConfig = defaultConfig;

let app: any;
let db: any;
let auth: any;
let isFirebaseConnected = false;

try {
  if (import.meta.env.VITE_DATA_BACKEND === 'sqlserver') throw new Error('Firebase disabled in SQL mode');
  // Silence SDK connection retry warnings in console (Firestore seamlessly uses offline cache)
  setLogLevel('silent');
  
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  
  db = getFirestore(app);
  auth = getAuth(app);
  isFirebaseConnected = true;
  console.log("Firebase initialized successfully with credentials for projectId:", firebaseConfig.projectId);

  // Non-blocking connection probe that does not throw or trigger unhandled rejection
  const testConnection = async () => {
    try {
      await getDoc(doc(db, 'security_settings', 'config')).catch(() => null);
    } catch {
      // Gracefully silent: Firestore automatically handles offline persistence
    }
  };
  testConnection().catch(() => {});
} catch (error) {
  if (import.meta.env.VITE_DATA_BACKEND !== 'sqlserver') console.error("Firebase initialization failed:", error);
  isFirebaseConnected = false;
}

export { app, db, auth, isFirebaseConnected };
