import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../auth/auth-context";
import { theme } from "../theme";

export function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(email.trim(), password, displayName.trim() || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Noget gik galt. Prøv igen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>1MM AI</Text>
        <Text style={styles.subtitle}>
          {mode === "login" ? "Log ind på din konto" : "Opret en ny konto"}
        </Text>

        {mode === "register" && (
          <TextInput
            style={styles.input}
            placeholder="Navn (valgfrit)"
            placeholderTextColor={theme.colors.textMuted}
            value={displayName}
            onChangeText={setDisplayName}
            accessibilityLabel="Navn"
          />
        )}
        <TextInput
          style={styles.input}
          placeholder="E-mail"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          accessibilityLabel="E-mail"
        />
        <TextInput
          style={styles.input}
          placeholder="Adgangskode (mindst 8 tegn)"
          placeholderTextColor={theme.colors.textMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          accessibilityLabel="Adgangskode"
        />

        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}

        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={submit}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>
            {busy ? "Vent…" : mode === "login" ? "Log ind" : "Opret konto"}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setMode(mode === "login" ? "register" : "login")}
          style={styles.switchLink}
          accessibilityRole="button"
        >
          <Text style={styles.switchText}>
            {mode === "login" ? "Har du ikke en konto? Opret konto" : "Har du en konto? Log ind"}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 26,
    fontWeight: "700",
  },
  subtitle: {
    color: theme.colors.textSecondary,
    marginTop: 4,
    marginBottom: theme.spacing.md,
  },
  input: {
    minHeight: theme.minTouchTarget,
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    color: theme.colors.textPrimary,
    paddingHorizontal: 12,
    marginBottom: theme.spacing.sm,
  },
  error: {
    color: theme.colors.danger,
    marginBottom: theme.spacing.sm,
  },
  button: {
    minHeight: theme.minTouchTarget,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: theme.spacing.xs,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  switchLink: {
    marginTop: theme.spacing.md,
    alignItems: "center",
    minHeight: theme.minTouchTarget,
    justifyContent: "center",
  },
  switchText: {
    color: theme.colors.accent,
  },
});
