import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Link } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { StatusIndicator } from "../components/StatusIndicator";
import { DEFAULT_SERVER_URL } from "../constants/config";
import { useAuth } from "../contexts/AuthContext";
import { useIntervalUpload } from "../hooks/useIntervalUpload";
import { claimCamera } from "../services/cameraService";
import { getOrCreateCameraId } from "../utils/cameraId";

type Facing = "back" | "front";

function peopleBadgeColor(count: number): string {
  if (count === 0) return "#10b981";
  if (count <= 2) return "#f59e0b";
  return "#ef4444";
}

export default function CameraScreen() {
  const { user, signOut } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [isActive, setIsActive] = useState(false);
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [cameraId, setCameraId] = useState("");
  const [facing, setFacing] = useState<Facing>("back");
  const [torch, setTorch] = useState(false);
  const [claiming, setClaiming] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const savedUrl = await AsyncStorage.getItem("serverUrl");
        if (savedUrl) setServerUrl(savedUrl);
        const id = await getOrCreateCameraId();
        setCameraId(id);
      })();
    }, [])
  );

  const uploadState = useIntervalUpload({
    cameraRef,
    serverUrl,
    cameraId,
    enabled: isActive,
  });

  const toggleFacing = () => {
    setFacing((f) => {
      const next = f === "back" ? "front" : "back";
      if (next === "front") setTorch(false);
      return next;
    });
  };

  const toggleTorch = () => {
    if (facing === "front") return;
    setTorch((t) => !t);
  };

  /**
   * Avvia la sorveglianza dopo aver garantito che la camera risulti
   * rivendicata dall'utente corrente. La chiamata è idempotente: se la
   * camera è già dell'utente non scrive nulla.
   */
  const handleStart = async () => {
    if (!cameraId || !user) return;
    setClaiming(true);
    try {
      const result = await claimCamera(cameraId, user.uid);
      if (result.status === "owned_by_other") {
        Alert.alert(
          "Camera non disponibile",
          "Questo identificativo è già associato a un altro account.",
          [{ text: "OK" }]
        );
        return;
      }
      setIsActive(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore claim camera";
      Alert.alert("Errore", msg);
    } finally {
      setClaiming(false);
    }
  };

  const handleStop = () => setIsActive(false);

  const handleSignOut = () => {
    Alert.alert("Esci", "Vuoi disconnettere questo dispositivo?", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Esci",
        style: "destructive",
        onPress: async () => {
          setIsActive(false);
          await signOut();
        },
      },
    ]);
  };

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>
          Permesso fotocamera necessario
        </Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Concedi permesso</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const peopleCount = uploadState.lastPeopleCount;
  const showPeopleBadge = peopleCount !== null && uploadState.uploadCount > 0;
  const startDisabled = !cameraId || !user || claiming;

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        enableTorch={torch && facing === "back"}
      />
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topRow}>
          <View style={styles.statusWrap}>
            <StatusIndicator
              status={uploadState.status}
              lastPeopleCount={uploadState.lastPeopleCount}
              lastError={uploadState.lastError}
              uploadCount={uploadState.uploadCount}
            />
          </View>
          {showPeopleBadge && (
            <View
              style={[
                styles.peopleBadge,
                { backgroundColor: peopleBadgeColor(peopleCount!) },
              ]}
            >
              <Text style={styles.peopleBadgeIcon}>👥</Text>
              <Text style={styles.peopleBadgeCount}>{peopleCount}</Text>
            </View>
          )}
        </View>

        <View style={styles.cameraControls}>
          <TouchableOpacity style={styles.iconBtn} onPress={toggleFacing}>
            <Text style={styles.iconBtnText}>
              {facing === "back" ? "🔄 Front" : "🔄 Back"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.iconBtn,
              facing === "front" && styles.iconBtnDisabled,
              torch && styles.iconBtnActive,
            ]}
            onPress={toggleTorch}
            disabled={facing === "front"}
          >
            <Text style={styles.iconBtnText}>
              {torch ? "🔦 ON" : "🔦 OFF"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity
            style={[
              styles.button,
              isActive && styles.buttonStop,
              startDisabled && !isActive && styles.buttonDisabled,
            ]}
            onPress={isActive ? handleStop : handleStart}
            disabled={!isActive && startDisabled}
          >
            <Text style={styles.buttonText}>
              {claiming
                ? "REGISTRAZIONE CAMERA…"
                : !cameraId
                ? "INIZIALIZZAZIONE…"
                : isActive
                ? "STOP"
                : "AVVIA SORVEGLIANZA"}
            </Text>
          </TouchableOpacity>

          <View style={styles.bottomRow}>
            <Link href="/settings" asChild>
              <TouchableOpacity>
                <Text style={styles.linkText}>⚙ Impostazioni</Text>
              </TouchableOpacity>
            </Link>
            <TouchableOpacity onPress={handleSignOut}>
              <Text style={styles.linkText}>Esci</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.info}>
          {user?.email ?? "—"} · {cameraId} ·{" "}
          {serverUrl.replace("https://", "")}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  camera: { ...StyleSheet.absoluteFillObject },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    justifyContent: "space-between",
    paddingTop: 20,
    paddingBottom: 40,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingRight: 16,
  },
  statusWrap: { flex: 1 },
  peopleBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    gap: 6,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  peopleBadgeIcon: { fontSize: 18 },
  peopleBadgeCount: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 22,
    minWidth: 18,
    textAlign: "center",
  },
  cameraControls: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 16,
  },
  iconBtn: {
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  iconBtnActive: {
    backgroundColor: "rgba(245, 158, 11, 0.85)",
    borderColor: "rgba(245, 158, 11, 1)",
  },
  iconBtnDisabled: { opacity: 0.4 },
  iconBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  controls: { alignItems: "center", gap: 12 },
  button: {
    backgroundColor: "#2196F3",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 30,
  },
  buttonStop: { backgroundColor: "#f44336" },
  buttonDisabled: { backgroundColor: "#555", opacity: 0.6 },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  bottomRow: {
    flexDirection: "row",
    gap: 28,
    alignItems: "center",
  },
  linkText: { color: "#ccc", fontSize: 14 },
  permissionText: {
    color: "#fff",
    textAlign: "center",
    marginBottom: 20,
    fontSize: 16,
  },
  info: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    textAlign: "center",
    paddingHorizontal: 12,
  },
});
