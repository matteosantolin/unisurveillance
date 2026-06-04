import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getAlertRules,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  AlertRule,
} from "../services/firestoreService";
import { AlertForm } from "../components/AlertForm";
import { useCameras } from "../hooks/useCameras";
import { useAuth } from "../hooks/useAuth";
import { useUserEmails } from "../hooks/useUserEmails";
import { utcTimeToLocal } from "../utils/timezone";
import styles from "./AlertSettings.module.css";

export function AlertSettings() {
  const { user, isAdmin } = useAuth();
  const { cameras } = useCameras(isAdmin);
  const [cameraId, setCameraId] = useState("");
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(false);

  // Reset selezione se la camera corrente non è più visibile.
  useEffect(() => {
    if (cameraId && cameras.length > 0 && !cameras.some((c) => c.camera_id === cameraId)) {
      setCameraId("");
    }
  }, [cameras, cameraId]);

  const loadRules = async () => {
    if (!cameraId) {
      setRules([]);
      return;
    }
    setLoading(true);
    try {
      const data = await getAlertRules(cameraId, isAdmin);
      setRules(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, [cameraId, isAdmin]);

  const handleCreate = async (rule: Omit<AlertRule, "id">) => {
    await createAlertRule(rule);
    await loadRules();
  };

  const handleToggle = async (rule: AlertRule) => {
    if (!rule.id) return;
    // Admin può leggere le rule di altri ma non modificarle (Firestore rules).
    if (isAdmin && rule.owner_uid && rule.owner_uid !== user?.uid) return;
    await updateAlertRule(rule.id, { active: !rule.active });
    await loadRules();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Eliminare questa regola?")) return;
    await deleteAlertRule(id);
    await loadRules();
  };

  const cameraOptions = cameras.map((c) => c.camera_id);
  const selectedCamera = cameras.find((c) => c.camera_id === cameraId) ?? null;

  /** Set degli uid che dobbiamo risolvere -> email per la UI corrente. */
  const ownerUids = useMemo(() => {
    const set = new Set<string>();
    if (selectedCamera?.owner_uid) set.add(selectedCamera.owner_uid);
    rules.forEach((r) => r.owner_uid && set.add(r.owner_uid));
    return [...set];
  }, [selectedCamera, rules]);

  const emailMap = useUserEmails(ownerUids);

  /**
   * Risolve l'uid alla rappresentazione "umana": email se nota,
   * altrimenti uid completo (mai troncato). Per uid che l'utente non
   * ha permesso di leggere su /users/{uid}, la mappa restituisce null
   * e ricadiamo sull'uid raw.
   */
  const displayOwner = (uid: string | null | undefined): string => {
    if (!uid) return "—";
    return emailMap.get(uid) ?? uid;
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.back}>← Indietro</Link>
        <h1>Configurazione allarmi</h1>
        {isAdmin && <span className={styles.adminBadge}>ADMIN</span>}
      </header>

      <main className={styles.main}>
        <div className={styles.cameraFilter}>
          <label>Telecamera</label>
          <select
            value={cameraId}
            onChange={(e) => setCameraId(e.target.value)}
            className={styles.input}
          >
            <option value="">
              {cameraOptions.length === 0 ? "Nessuna camera disponibile" : "Seleziona camera…"}
            </option>
            {cameraOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {cameraId && selectedCamera && (
          <div className={styles.cameraMeta}>
            <span className={styles.metaLabel}>Camera owner</span>
            <span
              className={styles.metaValue}
              title={selectedCamera.owner_uid ?? "non rivendicata"}
            >
              {displayOwner(selectedCamera.owner_uid)}
              {selectedCamera.owner_uid === user?.uid && (
                <span className={styles.metaSelf}> · tu</span>
              )}
            </span>
          </div>
        )}

        {cameraId && <AlertForm cameraId={cameraId} onSave={handleCreate} />}

        {cameraId && (
          <section className={styles.rulesSection}>
            <h2 className={styles.sectionTitle}>Regole attive per {cameraId}</h2>

            {loading && <p className={styles.dim}>Caricamento…</p>}

            {!loading && rules.length === 0 && (
              <p className={styles.dim}>Nessuna regola configurata</p>
            )}

            {rules.map((rule) => {
              const isOwn = !rule.owner_uid || rule.owner_uid === user?.uid;
              return (
                <div key={rule.id} className={styles.ruleCard}>
                  <div className={styles.ruleInfo}>
                    <div className={styles.ruleHeader}>
                      <span className={styles.ruleTime}>
                        {utcTimeToLocal(rule.start_time)} → {utcTimeToLocal(rule.end_time)}
                      </span>
                      <span className={styles.ruleThreshold}>
                        &gt;= {rule.threshold} person{rule.threshold === 1 ? "a" : "e"}
                      </span>
                      <span className={styles.ruleEmail}>{rule.recipient_email}</span>
                      {isAdmin && !isOwn && (
                        <span className={styles.foreignTag}>read-only</span>
                      )}
                    </div>
                    <div className={styles.ruleMeta}>
                      <span className={styles.metaChip} title={rule.id}>
                        <span className={styles.metaChipKey}>id</span>
                        <code className={styles.metaChipVal}>{rule.id ?? "—"}</code>
                      </span>
                      <span
                        className={styles.metaChip}
                        title={rule.owner_uid ?? ""}
                      >
                        <span className={styles.metaChipKey}>owner</span>
                        <code className={styles.metaChipVal}>
                          {displayOwner(rule.owner_uid)}
                        </code>
                        {rule.owner_uid === user?.uid && (
                          <span className={styles.metaSelf}>tu</span>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className={styles.ruleActions}>
                    <button
                      className={rule.active ? styles.btnActive : styles.btnInactive}
                      onClick={() => handleToggle(rule)}
                      disabled={!isOwn}
                    >
                      {rule.active ? "Attiva" : "Disattivata"}
                    </button>
                    <button
                      className={styles.btnDelete}
                      onClick={() => rule.id && handleDelete(rule.id)}
                      disabled={!isOwn}
                    >
                      Elimina
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {!cameraId && (
          <p className={styles.dim}>
            {cameraOptions.length === 0
              ? "Nessuna telecamera disponibile per il tuo account"
              : "Seleziona una telecamera per gestire le regole di allarme"}
          </p>
        )}
      </main>
    </div>
  );
}
