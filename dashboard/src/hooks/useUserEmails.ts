import { useEffect, useState } from "react";

import { fetchUserEmail } from "../services/userProfileService";

/**
 * Cache modulo-level così non rifacciamo la stessa lookup quando lo stesso
 * uid appare in più punti dell'app durante la sessione.
 */
const cache = new Map<string, string | null>();

/**
 * Risolve un elenco di uid alle loro email leggendo `/users/{uid}` su
 * Firestore. Ritorna una mappa stabile uid -> email|null (null = mai
 * accessibile o doc inesistente).
 *
 * Le rules Firestore consentono il `get` solo se uid == auth.uid oppure
 * isAdmin(): per uid altrui non-admin il fetch fallirà e l'entry sarà null.
 */
export function useUserEmails(uids: readonly string[]): Map<string, string | null> {
  const [emails, setEmails] = useState<Map<string, string | null>>(() => {
    const m = new Map<string, string | null>();
    uids.forEach((u) => m.set(u, cache.get(u) ?? null));
    return m;
  });

  // Stable key: ordine non importa, lavoriamo per set.
  const key = [...new Set(uids)].sort().join(",");

  useEffect(() => {
    let cancelled = false;
    const unique = [...new Set(uids)];
    const missing = unique.filter((u) => !cache.has(u));

    if (missing.length === 0) {
      // Tutto già in cache: rebuild della map per i prop attuali.
      setEmails(() => {
        const m = new Map<string, string | null>();
        unique.forEach((u) => m.set(u, cache.get(u) ?? null));
        return m;
      });
      return;
    }

    (async () => {
      await Promise.all(
        missing.map(async (uid) => {
          try {
            const email = await fetchUserEmail(uid);
            cache.set(uid, email);
          } catch {
            cache.set(uid, null);
          }
        })
      );
      if (cancelled) return;
      setEmails(() => {
        const m = new Map<string, string | null>();
        unique.forEach((u) => m.set(u, cache.get(u) ?? null));
        return m;
      });
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return emails;
}
