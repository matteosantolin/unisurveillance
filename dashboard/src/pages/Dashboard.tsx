import React, { useEffect, useState } from "react";
import { signOut } from "../services/authService";
import { useDetections, Detection } from "../hooks/useDetections";
import { useCameras } from "../hooks/useCameras";
import { useAuth } from "../hooks/useAuth";
import { PeopleChart } from "../components/PeopleChart";
import { PhotoModal } from "../components/PhotoModal";
import { downloadCsv } from "../utils/exportCsv";
import { Link } from "react-router-dom";
import styles from "./Dashboard.module.css";

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function todayEnd() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export function Dashboard() {
  const { user, isAdmin } = useAuth();
  const { cameras } = useCameras(isAdmin);
  const [cameraId, setCameraId] = useState("");
  const [dateFrom, setDateFrom] = useState(todayStart());
  const [dateTo, setDateTo] = useState(todayEnd());
  const [selectedDetection, setSelectedDetection] = useState<Detection | null>(null);

  // Se la camera selezionata sparisce dalla lista (es. l'admin disattiva il flag),
  // reset alla nessuna selezione per evitare di mostrare dati di camere non più visibili.
  useEffect(() => {
    if (cameraId && cameras.length > 0 && !cameras.some((c) => c.camera_id === cameraId)) {
      setCameraId("");
    }
  }, [cameras, cameraId]);

  const { detections, loading } = useDetections({ cameraId, dateFrom, dateTo, isAdmin });

  const handleDateFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = new Date(e.target.value);
    d.setHours(0, 0, 0, 0);
    setDateFrom(d);
  };

  const handleDateToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = new Date(e.target.value);
    d.setHours(23, 59, 59, 999);
    setDateTo(d);
  };

  const toInputDate = (d: Date) => d.toISOString().split("T")[0];

  const maxPeople = detections.length > 0
    ? Math.max(...detections.map((d) => d.people_count))
    : 0;

  const avgPeople = detections.length > 0
    ? (detections.reduce((s, d) => s + d.people_count, 0) / detections.length).toFixed(1)
    : "—";

  const handleExport = () => {
    if (detections.length === 0) return;
    const fname = `detections_${cameraId}_${toInputDate(dateFrom)}_${toInputDate(dateTo)}.csv`;
    downloadCsv(fname, detections);
  };

  const cameraOptions = cameras.map((c) => c.camera_id);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.logo}>OPS · LIVE</span>
          <h1>uni</h1>
        </div>
        <nav className={styles.nav}>
          {user?.email && (
            <span
              className={`${styles.userEmail} ${isAdmin ? styles.userEmailAdmin : ""}`}
              title={`${user.email} · ${isAdmin ? "admin" : "utente standard"}`}
            >
              <span className={styles.userDot} />
              <span className={styles.userEmailText}>{user.email}</span>
              <span className={styles.userRoleTag}>{isAdmin ? "ADMIN" : "USER"}</span>
            </span>
          )}
          <Link to="/alerts" className={styles.navLink}>Allarmi</Link>
          <button className={styles.logoutBtn} onClick={signOut}>Esci</button>
        </nav>
      </header>

      <main className={styles.main}>
        <section className={styles.filters}>
          <div className={styles.filterGroup}>
            <label>Telecamera</label>
            <select
              value={cameraId}
              onChange={(e) => setCameraId(e.target.value)}
              className={styles.filterInput}
            >
              <option value="">
                {cameraOptions.length === 0 ? "Nessuna camera disponibile" : "Seleziona camera…"}
              </option>
              {cameraOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label>Dal</label>
            <input
              type="date"
              value={toInputDate(dateFrom)}
              onChange={handleDateFromChange}
              className={styles.filterInput}
            />
          </div>
          <div className={styles.filterGroup}>
            <label>Al</label>
            <input
              type="date"
              value={toInputDate(dateTo)}
              onChange={handleDateToChange}
              className={styles.filterInput}
            />
          </div>
          <div className={styles.filterGroup}>
            <label>&nbsp;</label>
            <button
              className={styles.filterInput}
              onClick={handleExport}
              disabled={detections.length === 0}
              style={{ cursor: detections.length === 0 ? "not-allowed" : "pointer" }}
            >
              Esporta CSV
            </button>
          </div>
        </section>

        {!cameraId && (
          <p className={styles.hint}>
            {cameraOptions.length === 0
              ? "Nessuna telecamera disponibile per il tuo account"
              : "Seleziona una telecamera per visualizzare le rilevazioni"}
          </p>
        )}

        {cameraId && (
          <>
            <div className={styles.stats}>
              <div className={styles.statCard}>
                <span className={styles.statValue}>{detections.length}</span>
                <span className={styles.statLabel}>Rilevazioni · totale</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statValue}>{maxPeople}</span>
                <span className={styles.statLabel}>Picco · persone</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statValue}>{avgPeople}</span>
                <span className={styles.statLabel}>Media · persone</span>
              </div>
              <div className={styles.statCard}>
                <div className={styles.liveIndicator}>
                  <span className={loading ? "" : styles.liveDot} />
                  <span>{loading ? "syncing" : "live"}</span>
                </div>
                <span className={styles.statLabel}>Stato · feed</span>
              </div>
            </div>

            {detections.length > 0 && (
              <p className={styles.hint}>
                Clicca un punto sulla timeline per ispezionare la rilevazione
              </p>
            )}

            <section className={styles.chartSection}>
              <PeopleChart
                detections={detections}
                onSelectDetection={setSelectedDetection}
              />
            </section>

            {detections.length > 0 && (
              <section className={styles.listSection}>
                <h2 className={styles.sectionTitle}>Ultime rilevazioni</h2>
                <div className={styles.detectionList} role="list">
                  {[...detections].reverse().slice(0, 10).map((d) => (
                    <button
                      key={d.id}
                      className={styles.detectionRow}
                      onClick={() => setSelectedDetection(d)}
                    >
                      <span className={styles.detectionTime}>
                        {d.timestamp.toLocaleString("it-IT")}
                      </span>
                      <span className={styles.detectionCount}>
                        {d.people_count} {d.people_count === 1 ? "persona" : "persone"}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <PhotoModal
        detection={selectedDetection}
        onClose={() => setSelectedDetection(null)}
      />
    </div>
  );
}
