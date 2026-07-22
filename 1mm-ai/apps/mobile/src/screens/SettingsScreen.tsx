import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { apiFetch } from "../api/client";
import { useAuth } from "../auth/auth-context";
import { useNavigation } from "../navigation";
import { theme } from "../theme";

export function SettingsScreen() {
  const { back } = useNavigation();
  const { user, logout } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [saveTranscripts, setSaveTranscripts] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const body = await apiFetch<{
          preferences: { displayName: string | null; saveVoiceTranscripts: boolean };
        }>("/api/preferences");
        setDisplayName(body.preferences.displayName ?? "");
        setSaveTranscripts(body.preferences.saveVoiceTranscripts);
      } catch {
        // Defaults stay in place.
      }
    })();
  }, []);

  async function save() {
    try {
      await apiFetch("/api/preferences", {
        method: "PATCH",
        body: {
          displayName: displayName.trim() || undefined,
          saveVoiceTranscripts: saveTranscripts,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2_000);
    } catch {
      Alert.alert("Fejl", "Indstillingerne kunne ikke gemmes.");
    }
  }

  function deleteAccount() {
    Alert.alert(
      "Slet konto",
      "Slet din konto permanent? Alle samtaler, beskeder og minder slettes. Dette kan ikke fortrydes.",
      [
        { text: "Annullér", style: "cancel" },
        {
          text: "Slet konto",
          style: "destructive",
          onPress: async () => {
            try {
              await apiFetch("/api/account", { method: "DELETE" });
              await logout();
            } catch {
              Alert.alert("Fejl", "Kontoen kunne ikke slettes. Prøv igen.");
            }
          },
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={back} style={styles.backButton} accessibilityRole="button">
          <Text style={styles.backText}>‹ Tilbage</Text>
        </Pressable>
        <Text style={styles.title}>Indstillinger</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Profil</Text>
        <Text style={styles.meta}>{user?.email}</Text>
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Navn"
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel="Navn"
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Privatliv</Text>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Gem transskriptioner fra stemmesamtaler</Text>
          <Switch
            value={saveTranscripts}
            onValueChange={setSaveTranscripts}
            trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
            accessibilityLabel="Gem transskriptioner"
          />
        </View>
      </View>

      <Pressable onPress={() => void save()} style={styles.saveButton} accessibilityRole="button">
        <Text style={styles.saveText}>{saved ? "Gemt!" : "Gem indstillinger"}</Text>
      </Pressable>

      <Pressable onPress={() => void logout()} style={styles.logout} accessibilityRole="button">
        <Text style={styles.logoutText}>Log ud</Text>
      </Pressable>

      <Pressable onPress={deleteAccount} style={styles.deleteButton} accessibilityRole="button">
        <Text style={styles.deleteText}>Slet konto og alle data</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing.md,
  },
  backButton: { minWidth: 80, minHeight: theme.minTouchTarget, justifyContent: "center" },
  backText: { color: theme.colors.accent, fontSize: 16 },
  title: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: "700" },
  card: {
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sectionTitle: { color: theme.colors.textPrimary, fontWeight: "600", marginBottom: 6 },
  meta: { color: theme.colors.textMuted, fontSize: 13, marginBottom: theme.spacing.sm },
  input: {
    minHeight: theme.minTouchTarget,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.sm,
    color: theme.colors.textPrimary,
    paddingHorizontal: 12,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  toggleLabel: { color: theme.colors.textPrimary, flex: 1 },
  saveButton: {
    marginHorizontal: theme.spacing.md,
    minHeight: theme.minTouchTarget,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: "#fff", fontWeight: "600" },
  logout: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    minHeight: theme.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  logoutText: { color: theme.colors.textSecondary },
  deleteButton: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    minHeight: theme.minTouchTarget,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteText: { color: theme.colors.danger, fontWeight: "600" },
});
