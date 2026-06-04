import React, { useState } from "react";
import type { AlertRule } from "../services/firestoreService";
import { localTimeToUtc } from "../utils/timezone";
import styles from "./AlertForm.module.css";

interface Props {
  cameraId: string;
  onSave: (rule: Omit<AlertRule, "id">) => Promise<void>;
}

export function AlertForm({ cameraId, onSave }: Props) {
  // Gli orari nel form sono nel fuso del browser; al save vengono convertiti in UTC.
  const [startTime, setStartTime] = useState("23:00");
  const [endTime, setEndTime] = useState("06:00");
  const [threshold, setThreshold] = useState(1);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setSaving(true);
    setError(null);
    try {
      await onSave({
        camera_id: cameraId,
        start_time: localTimeToUtc(startTime),
        end_time: localTimeToUtc(endTime),
        threshold,
        recipient_email: email,
        active: true,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Errore durante il salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h3 className={styles.title}>Nuova regola di allarme</h3>

      <div className={styles.row}>
        <div className={styles.field}>
          <label>Orario inizio (locale)</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label>Orario fine (locale)</label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label>Soglia persone</label>
          <input
            type="number"
            min={0}
            value={threshold}
            onChange={(e) => setThreshold(parseInt(e.target.value, 10))}
          />
        </div>
      </div>

      <div className={styles.field}>
        <label>Email destinatario</label>
        <input
          type="email"
          placeholder="admin@esempio.it"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <p className={styles.hint} style={{fontSize:"0.75rem", color:"#888", marginBottom:"4px"}}>
        Gli orari sono nel fuso del tuo dispositivo; vengono convertiti in UTC per il server.
      </p>
      <p className={styles.hint}>
        Invia un'email a <strong>{email || "…"}</strong> se vengono rilevate
        almeno <strong>{threshold}</strong> person{threshold === 1 ? "a" : "e"} tra le{" "}
        <strong>{startTime}</strong> e le <strong>{endTime}</strong>.
      </p>

      {error && (
        <p className={styles.hint} style={{ color: "#f44336" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        className={styles.btn}
        disabled={saving || !email}
      >
        {saving ? "Salvataggio in corso" : saved ? "Salvato" : "Aggiungi regola"}
      </button>
    </form>
  );
}
