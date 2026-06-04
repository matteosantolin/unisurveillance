import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { FirebaseError } from "firebase/app";

import { useAuth } from "../contexts/AuthContext";

/** Mappa codici Firebase Auth ai messaggi italiani mostrati all'utente. */
const ERROR_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Email o password non corretti",
  "auth/invalid-email": "Email non valida",
  "auth/user-disabled": "Account disabilitato",
  "auth/user-not-found": "Utente non registrato",
  "auth/wrong-password": "Password errata",
  "auth/too-many-requests": "Troppi tentativi. Riprova tra qualche minuto",
  "auth/network-request-failed": "Errore di rete. Verifica la connessione",
  "auth/missing-password": "Inserisci la password",
};

function describeAuthError(err: unknown): string {
  if (err instanceof FirebaseError) {
    return ERROR_MESSAGES[err.code] ?? `Errore (${err.code})`;
  }
  if (err instanceof Error) return err.message;
  return "Errore di autenticazione";
}

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      setError("Email e password richieste");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.logo}>uni</Text>
        <Text style={styles.title}>UniSurveillance</Text>
        <Text style={styles.subtitle}>
          Accedi per associare questo dispositivo al tuo account.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#666"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
          editable={!busy}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#666"
          secureTextEntry
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
          editable={!busy}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Accedi</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0B0E",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: "#16213e",
    padding: 28,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#0f3460",
  },
  logo: {
    color: "#FF7B95",
    fontSize: 40,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 4,
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  subtitle: {
    color: "#aaa",
    fontSize: 13,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 22,
  },
  input: {
    backgroundColor: "#0B0B0E",
    color: "#fff",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#0f3460",
    marginBottom: 12,
  },
  error: {
    color: "#ff6b6b",
    fontSize: 13,
    marginBottom: 12,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#FF7B95",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#0B0B0E",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
