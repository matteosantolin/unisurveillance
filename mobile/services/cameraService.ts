import { doc, runTransaction } from "firebase/firestore";

import { db } from "../firebase";

export type ClaimResult =
  | { status: "claimed" }
  | { status: "already_owned" }
  | { status: "owned_by_other"; owner: string };

/**
 * Esegue una transazione Firestore che assegna `owner_uid` al documento
 * `cameras/{cameraId}` se la camera non è ancora stata rivendicata.
 *
 * - Se la camera non esiste: viene creata con owner=uid.
 * - Se è già di `uid`: noop, ritorna `already_owned`.
 * - Se è di un altro utente: ritorna `owned_by_other`, nessuna modifica.
 *
 * La transazione garantisce che due dispositivi che provano a rivendicare
 * lo stesso `cameraId` simultaneamente non possano sovrascriversi.
 */
export async function claimCamera(
  cameraId: string,
  uid: string
): Promise<ClaimResult> {
  const ref = doc(db, "cameras", cameraId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      tx.set(ref, { camera_id: cameraId, owner_uid: uid });
      return { status: "claimed" } as const;
    }
    const owner = (snap.data().owner_uid as string | undefined) ?? null;
    if (owner === uid) return { status: "already_owned" } as const;
    return { status: "owned_by_other", owner: owner ?? "" } as const;
  });
}
