import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { DEFAULT_SERVER_URL } from "../constants/config";
import { getOrCreateCameraId } from "../utils/cameraId";

export default function SettingsScreen() {
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [cameraId, setCameraId] = useState("");

  useEffect(() => {
    (async () => {
      const savedUrl = await AsyncStorage.getItem("serverUrl");
      if (savedUrl) setServerUrl(savedUrl);
      const id = await getOrCreateCameraId();
      setCameraId(id);
    })();
  }, []);

  const save = async () => {
    if (!serverUrl.startsWith("http")) {
      Alert.alert("Errore", "L'URL del server deve iniziare con http:// o https://");
      return;
    }
    await AsyncStorage.setItem("serverUrl", serverUrl.trim());
    await AsyncStorage.setItem("cameraId", cameraId.trim());
    Alert.alert("Salvato", "Impostazioni aggiornate", [
      { text: "OK", onPress: () => router.back() },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.label}>URL Server</Text>
      <TextInput
        style={styles.input}
        value={serverUrl}
        onChangeText={setServerUrl}
        placeholder="https://your-cloud-run-url.run.app"
        placeholderTextColor="#666"
        autoCapitalize="none"
        keyboardType="url"
      />

      <Text style={styles.label}>ID Telecamera</Text>
      <TextInput
        style={styles.input}
        value={cameraId}
        onChangeText={setCameraId}
        placeholder="cam-01"
        placeholderTextColor="#666"
        autoCapitalize="none"
      />

      <TouchableOpacity style={styles.button} onPress={save}>
        <Text style={styles.buttonText}>Salva</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    padding: 24,
  },
  label: {
    color: "#aaa",
    fontSize: 13,
    marginBottom: 6,
    marginTop: 20,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  input: {
    backgroundColor: "#16213e",
    color: "#fff",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#0f3460",
  },
  button: {
    marginTop: 36,
    backgroundColor: "#2196F3",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
