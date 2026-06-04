import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { UploadStatus } from "../hooks/useIntervalUpload";

interface Props {
  status: UploadStatus;
  lastPeopleCount: number | null;
  lastError: string | null;
  uploadCount: number;
}

const STATUS_CONFIG: Record<UploadStatus, { color: string; label: string }> = {
  idle: { color: "#888", label: "In attesa..." },
  capturing: { color: "#f0a500", label: "Scatto in corso..." },
  uploading: { color: "#2196F3", label: "Upload in corso..." },
  success: { color: "#4CAF50", label: "Inviato!" },
  error: { color: "#f44336", label: "Errore" },
};

export function StatusIndicator({ status, lastPeopleCount, lastError, uploadCount }: Props) {
  const { color, label } = STATUS_CONFIG[status];

  return (
    <View style={styles.container}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={styles.textContainer}>
        <Text style={[styles.statusLabel, { color }]}>{label}</Text>
        {status === "success" && lastPeopleCount !== null && (
          <Text style={styles.info}>Persone: {lastPeopleCount} | Foto inviate: {uploadCount}</Text>
        )}
        {status === "error" && lastError && (
          <Text style={styles.error}>{lastError}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    padding: 10,
    marginHorizontal: 16,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  textContainer: {
    flex: 1,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  info: {
    color: "#ccc",
    fontSize: 12,
    marginTop: 2,
  },
  error: {
    color: "#ff6b6b",
    fontSize: 12,
    marginTop: 2,
  },
});
