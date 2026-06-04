import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  limit,
  Timestamp,
} from "firebase/firestore";

import { auth, db } from "../firebase";

const MAX_RESULTS = 500;

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
}

export interface Detection {
  id: string;
  camera_id: string;
  timestamp: Date;
  people_count: number;
  photo_url: string;
  boxes?: Box[];
  img_width?: number;
  img_height?: number;
}

interface UseDetectionsOptions {
  cameraId: string;
  dateFrom: Date;
  dateTo: Date;
  /** Se true bypassa il filtro per owner_uid (admin globale). */
  isAdmin?: boolean;
}

/**
 * Stream realtime delle detection di una camera nell'intervallo dato.
 * Le Firestore rules richiedono che la query includa `owner_uid == uid`
 * per gli utenti non-admin: il filtro è qui imposto esplicitamente.
 *
 * Firestore creerà al primo run un composite index su
 * `(owner_uid, camera_id, timestamp DESC)`.
 */
export function useDetections({
  cameraId,
  dateFrom,
  dateTo,
  isAdmin = false,
}: UseDetectionsOptions) {
  const [detections, setDetections] = useState<Detection[]>([]);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    if (!cameraId) {
      setDetections([]);
      setLoading(false);
      return;
    }
    if (!isAdmin && !uid) {
      setDetections([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const constraints = [
      where("camera_id", "==", cameraId),
      where("timestamp", ">=", Timestamp.fromDate(dateFrom)),
      where("timestamp", "<=", Timestamp.fromDate(dateTo)),
      orderBy("timestamp", "desc"),
      limit(MAX_RESULTS),
    ];
    const q = isAdmin
      ? query(collection(db, "detections"), ...constraints)
      : query(
          collection(db, "detections"),
          where("owner_uid", "==", uid),
          ...constraints
        );

    const unsub = onSnapshot(q, (snap) => {
      const data: Detection[] = snap.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          camera_id: d.camera_id,
          timestamp: (d.timestamp as Timestamp).toDate(),
          people_count: d.people_count,
          photo_url: d.photo_url,
          boxes: d.boxes,
          img_width: d.img_width,
          img_height: d.img_height,
        };
      });
      data.reverse();
      setDetections(data);
      setLoading(false);
    });

    return unsub;
  }, [cameraId, dateFrom.getTime(), dateTo.getTime(), isAdmin, uid]);

  return { detections, loading };
}
