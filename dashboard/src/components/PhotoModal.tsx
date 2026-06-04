import React, { useState } from "react";
import type { Detection } from "../hooks/useDetections";
import styles from "./PhotoModal.module.css";

interface Props {
  detection: Detection | null;
  onClose: () => void;
}

export function PhotoModal({ detection, onClose }: Props) {
  const [showBoxes, setShowBoxes] = useState(true);

  if (!detection) return null;

  const ts = detection.timestamp.toLocaleString("it-IT");
  const hasBoxes = !!(detection.boxes && detection.boxes.length > 0);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose} aria-label="Chiudi">×</button>
        <h3 className={styles.title}>
          {ts} — {detection.people_count} {detection.people_count === 1 ? "persona" : "persone"}
        </h3>
        <div className={styles.photoWrap}>
          <img
            src={detection.photo_url}
            alt="Foto sorveglianza"
            className={styles.photo}
          />
          {hasBoxes && showBoxes && (
            <svg
              className={styles.overlay}
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
            >
              {detection.boxes!.map((b, i) => (
                <g key={i}>
                  <rect
                    x={b.x1}
                    y={b.y1}
                    width={b.x2 - b.x1}
                    height={b.y2 - b.y1}
                  />
                </g>
              ))}
            </svg>
          )}
        </div>
        {hasBoxes && (
          <label className={styles.toggleBox}>
            <input
              type="checkbox"
              checked={showBoxes}
              onChange={(e) => setShowBoxes(e.target.checked)}
            />
            Mostra bounding box ({detection.boxes!.length})
          </label>
        )}
        <p className={styles.meta}>Camera: {detection.camera_id}</p>
      </div>
    </div>
  );
}
