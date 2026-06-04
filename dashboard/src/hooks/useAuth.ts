import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { syncUserProfile } from "../services/userProfileService";

/**
 * Stato auth + flag admin. Un utente è admin se esiste un documento
 * `admins/{uid}` in Firestore. Crea/elimina manualmente da console Firebase.
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const snap = await getDoc(doc(db, "admins", u.uid));
          setIsAdmin(snap.exists());
        } catch {
          setIsAdmin(false);
        }
        // Sincronizza /users/{uid} per permettere la risoluzione uid -> email
        // in UI (es. lista regole d'allarme). Non blocca il login.
        syncUserProfile(u.uid, u.email).catch(() => {
          /* fail silenzioso: non critico */
        });
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  return { user, isAdmin, loading };
}
