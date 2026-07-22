import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiFetch } from "../api/client";
import { useNavigation } from "../navigation";
import { theme } from "../theme";

interface MemoryDto {
  id: string;
  category: string;
  content: string;
  createdAt: string;
}

export function MemoriesScreen() {
  const { back } = useNavigation();
  const [memories, setMemories] = useState<MemoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoMemory, setAutoMemory] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const load = useCallback(async () => {
    try {
      const [memoriesBody, prefsBody] = await Promise.all([
        apiFetch<{ memories: MemoryDto[] }>("/api/memories"),
        apiFetch<{ preferences: { autoMemoryEnabled: boolean } }>("/api/preferences"),
      ]);
      setMemories(memoriesBody.memories);
      setAutoMemory(prefsBody.preferences.autoMemoryEnabled);
    } catch {
      Alert.alert("Fejl", "Hukommelsen kunne ikke hentes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleAutoMemory(value: boolean) {
    setAutoMemory(value);
    await apiFetch("/api/preferences", {
      method: "PATCH",
      body: { autoMemoryEnabled: value },
    }).catch(() => undefined);
  }

  async function saveEdit(id: string) {
    if (!editText.trim()) return;
    await apiFetch(`/api/memories/${id}`, {
      method: "PATCH",
      body: { content: editText.trim() },
    }).catch(() => Alert.alert("Fejl", "Kunne ikke gemme ændringen."));
    setEditingId(null);
    void load();
  }

  function deleteMemory(id: string) {
    Alert.alert("Slet memory", "Slet denne memory permanent?", [
      { text: "Annullér", style: "cancel" },
      {
        text: "Slet",
        style: "destructive",
        onPress: async () => {
          await apiFetch(`/api/memories/${id}`, { method: "DELETE" }).catch(() => undefined);
          setMemories((prev) => prev.filter((m) => m.id !== id));
        },
      },
    ]);
  }

  function forgetAll() {
    Alert.alert("Glem alt", "Slet alle gemte minder permanent?", [
      { text: "Annullér", style: "cancel" },
      {
        text: "Glem alt",
        style: "destructive",
        onPress: async () => {
          await apiFetch("/api/memories", { method: "DELETE" }).catch(() => undefined);
          setMemories([]);
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={back} style={styles.backButton} accessibilityRole="button">
          <Text style={styles.backText}>‹ Tilbage</Text>
        </Pressable>
        <Text style={styles.title}>Hukommelse</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Automatisk hukommelse</Text>
        <Switch
          value={autoMemory}
          onValueChange={(v) => void toggleAutoMemory(v)}
          trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
          accessibilityLabel="Automatisk hukommelse"
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: theme.spacing.xl }} color={theme.colors.primary} />
      ) : (
        <FlatList
          data={memories}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: theme.spacing.md, gap: theme.spacing.sm }}
          ListEmptyComponent={<Text style={styles.empty}>Ingen gemte minder endnu.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              {editingId === item.id ? (
                <View>
                  <TextInput
                    style={styles.editInput}
                    value={editText}
                    onChangeText={setEditText}
                    multiline
                    accessibilityLabel="Redigér memory"
                  />
                  <View style={styles.cardActions}>
                    <Pressable onPress={() => void saveEdit(item.id)} style={styles.action}>
                      <Text style={styles.actionText}>Gem</Text>
                    </Pressable>
                    <Pressable onPress={() => setEditingId(null)} style={styles.action}>
                      <Text style={styles.actionMuted}>Annullér</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View>
                  <Text style={styles.cardText}>{item.content}</Text>
                  <Text style={styles.cardMeta}>
                    {item.category} · {new Date(item.createdAt).toLocaleDateString("da-DK")}
                  </Text>
                  <View style={styles.cardActions}>
                    <Pressable
                      onPress={() => {
                        setEditingId(item.id);
                        setEditText(item.content);
                      }}
                      style={styles.action}
                      accessibilityRole="button"
                    >
                      <Text style={styles.actionText}>Redigér</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => deleteMemory(item.id)}
                      style={styles.action}
                      accessibilityRole="button"
                    >
                      <Text style={styles.actionDanger}>Slet</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          )}
        />
      )}

      {memories.length > 0 && (
        <Pressable onPress={forgetAll} style={styles.forgetAll} accessibilityRole="button">
          <Text style={styles.forgetAllText}>Glem alt</Text>
        </Pressable>
      )}
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  toggleLabel: { color: theme.colors.textPrimary },
  empty: { color: theme.colors.textMuted, textAlign: "center", marginTop: theme.spacing.lg },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  cardText: { color: theme.colors.textPrimary, fontSize: 15 },
  cardMeta: { color: theme.colors.textMuted, fontSize: 12, marginTop: 4 },
  cardActions: { flexDirection: "row", gap: theme.spacing.md, marginTop: theme.spacing.sm },
  action: { minHeight: theme.minTouchTarget, justifyContent: "center" },
  actionText: { color: theme.colors.accent, fontWeight: "600" },
  actionMuted: { color: theme.colors.textSecondary },
  actionDanger: { color: theme.colors.danger, fontWeight: "600" },
  editInput: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.sm,
    color: theme.colors.textPrimary,
    padding: theme.spacing.sm,
    minHeight: 60,
  },
  forgetAll: {
    margin: theme.spacing.md,
    minHeight: theme.minTouchTarget,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  forgetAllText: { color: theme.colors.danger, fontWeight: "600" },
});
