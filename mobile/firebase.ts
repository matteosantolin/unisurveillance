import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { initializeApp, getApps, getApp } from "firebase/app";
// `getReactNativePersistence` non è tipizzato nell'export pubblico di
// `firebase/auth`, ma è disponibile a runtime in firebase v10+: import dal
// path dedicato `@firebase/auth` per accedere al simbolo direttamente.
// Ref: https://github.com/firebase/firebase-js-sdk/issues/7615
import {
  initializeAuth,
  // @ts-expect-error: type esposto su modular API ma non in d.ts pubblico
  getReactNativePersistence,
  type Auth,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

interface FirebaseExtra {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

const firebaseConfig = (Constants.expoConfig?.extra?.firebase ??
  {}) as Partial<FirebaseExtra>;

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  throw new Error(
    "Firebase config mancante in app.json -> expo.extra.firebase. " +
      "Verifica i campi apiKey, authDomain, projectId, ..."
  );
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig as FirebaseExtra);

// initializeAuth deve essere chiamato una sola volta. Fast-Refresh durante
// lo sviluppo può ri-eseguire questo file: proteggiamo con try/catch.
let _auth: Auth;
try {
  _auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  // Già inizializzato in un import precedente: riusa l'istanza esistente.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  _auth = require("firebase/auth").getAuth(app);
}

export const auth = _auth;
export const db = getFirestore(app);
