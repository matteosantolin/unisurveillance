import type { Detection } from "../hooks/useDetections";

// Separatore ';' + BOM UTF-8 + CRLF per compatibilità diretta con Excel locale italiano.
const SEP = ";";
const NEWLINE = "\r\n";
const BOM = "﻿";

function escape(value: string | number): string {
  const s = String(value);
  if (s.includes(SEP) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function detectionsToCsv(detections: Detection[]): string {
  const header = ["timestamp", "camera_id", "people_count", "photo_url"].join(SEP);
  const rows = detections.map((d) =>
    [
      escape(d.timestamp.toISOString()),
      escape(d.camera_id),
      escape(d.people_count),
      escape(d.photo_url),
    ].join(SEP)
  );
  return [header, ...rows].join(NEWLINE);
}

export function downloadCsv(filename: string, detections: Detection[]): void {
  const csv = BOM + detectionsToCsv(detections);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
