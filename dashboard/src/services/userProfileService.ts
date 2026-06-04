import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { db } from "../firebase";

/**
 * Mirror minimo della Firebase Auth identity in Firestore: serve per
 * risalire dall'`uid` all'email da mostrare in UI (es. owner di camere
 * o regole d'allarme). Scritto da ogni client al login.
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

export async function fetchUserEmail(uid: string): Promise<string | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return (snap.data().email as string | undefined) ?? null;
}
