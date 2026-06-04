import {
  collection,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../firebase";

export interface AlertRule {
  id?: string;
  camera_id: string;
  start_time: string;   // "HH:MM" UTC
  end_time: string;     // "HH:MM" UTC
  threshold: number;
  recipient_email: string;
  active: boolean;
  owner_uid?: string;
}

function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Utente non autenticato");
  return uid;
}

export async function getAlertRules(
  cameraId: string,
  isAdmin = false
): Promise<AlertRule[]> {
  const uid = requireUid();
  const q = isAdmin
    ? query(collection(db, "alert_rules"), where("camera_id", "==", cameraId))
    : query(
        collection(db, "alert_rules"),
        where("owner_uid", "==", uid),
        where("camera_id", "==", cameraId)
      );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AlertRule, "id">) }));
}

export async function createAlertRule(rule: Omit<AlertRule, "id" | "owner_uid">): Promise<string> {
  const uid = requireUid();
  const camRef = doc(db, "cameras", rule.camera_id);
  const ruleRef = doc(collection(db, "alert_rules"));

  await runTransaction(db, async (tx) => {
    const camSnap = await tx.get(camRef);
    const currentOwner = camSnap.exists() ? camSnap.data().owner_uid : null;

    if (currentOwner && currentOwner !== uid) {
      throw new Error("Camera già rivendicata da un altro utente");
    }

    if (!currentOwner) {
      tx.set(
        camRef,
        { camera_id: rule.camera_id, owner_uid: uid },
        { merge: true }
      );
    }

    tx.set(ruleRef, {
      ...rule,
      owner_uid: uid,
      created_at: serverTimestamp(),
    });
  });

  return ruleRef.id;
}

export async function updateAlertRule(id: string, data: Partial<AlertRule>): Promise<void> {
  await updateDoc(doc(db, "alert_rules", id), data as Record<string, unknown>);
}

export async function deleteAlertRule(id: string): Promise<void> {
  await deleteDoc(doc(db, "alert_rules", id));
}
