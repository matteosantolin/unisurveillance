import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { auth, db } from "../firebase";

export interface Camera {
  id: string;
  camera_id: string;
  last_seen: Date | null;
  owner_uid: string | null;
}

/**
 * Live list delle camere visibili all'utente.
 *
 * - Non-admin: filtra lato server per `owner_uid == uid` (le Firestore rules
 *   richiedono il filtro esplicito, altrimenti la query fallisce).
 * - Admin: nessun filtro, riceve tutte le camere.
 */
export function useCameras(isAdmin = false) {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    if (!isAdmin && !uid) {
      setCameras([]);
      setLoading(false);
      return;
    }

    const q = isAdmin
      ? query(collection(db, "cameras"), orderBy("camera_id", "asc"))
      : query(
          collection(db, "cameras"),
          where("owner_uid", "==", uid),
          orderBy("camera_id", "asc")
        );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const data: Camera[] = snap.docs.map((d) => {
          const raw = d.data();
          const lastSeen = raw.last_seen as Timestamp | undefined;
          return {
            id: d.id,
            camera_id: (raw.camera_id as string | undefined) ?? d.id,
            last_seen: lastSeen ? lastSeen.toDate() : null,
            owner_uid: (raw.owner_uid as string | undefined) ?? null,
          };
        });
        setCameras(data);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return unsub;
  }, [isAdmin, uid]);

  return { cameras, loading };
}
