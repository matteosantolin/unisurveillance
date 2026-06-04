import { doc, serverTimestamp, setDoc } from "firebase/firestore";

import { db } from "../firebase";

/**
 * Mirror minimo della Firebase Auth identity in Firestore. Permette alla
 * dashboard di risolvere `uid -> email` (es. lista regole d'allarme).
 * Idempotente, fail-soft.
 */
export async function syncUserProfile(
  uid: string,
  email: string | null
): Promise<void> {
  if (!email) return;
  await setDoc(
    doc(db, "users", uid),
    { email, last_login: serverTimestamp() },
    { merge: true }
  );
}
