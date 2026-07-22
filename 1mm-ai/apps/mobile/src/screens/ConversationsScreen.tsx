import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { ConversationSummary } from "@1mm/shared";
import { apiFetch } from "../api/client";
import { useNavigation } from "../navigation";
import { theme } from "../theme";

export function ConversationsScreen() {
  const { navigate } = useNavigation();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const body = await apiFetch<{ conversations: ConversationSummary[] }>("/api/conversations");
      setConversations(body.conversations);
    } catch {
      Alert.alert("Fejl", "Samtalerne kunne ikke hentes. Træk ned for at prøve igen.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function confirmDelete(id: string) {
    Alert.alert("Slet samtale", "Slet samtalen permanent?", [
      { text: "Annullér", style: "cancel" },
      {
        text: "Slet",
        style: "destructive",
        onPress: async () => {
          await apiFetch(`/api/conversations/${id}`, { method: "DELETE" }).catch(() => undefined);
          void load();
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Samtaler</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => navigate({ name: "memories" })}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Hukommelse"
          >
            <Text style={styles.headerButtonText}>Hukommelse</Text>
          </Pressable>
          <Pressable
            onPress={() => navigate({ name: "settings" })}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Indstillinger"
          >
            <Text style={styles.headerButtonText}>Indstillinger</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={theme.colors.primary} size="large" />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor={theme.colors.primary}
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>Ingen samtaler endnu. Start din første!</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => navigate({ name: "chat", conversationId: item.id })}
              onLongPress={() => confirmDelete(item.id)}
              accessibilityRole="button"
              accessibilityHint="Tryk for at åbne, hold nede for at slette"
            >
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.title ?? "Ny samtale"}
              </Text>
              <Text style={styles.rowMeta}>
                {item.lastMessageAt
                  ? new Date(item.lastMessageAt).toLocaleString("da-DK", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Tom"}
              </Text>
            </Pressable>
          )}
        />
      )}

      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => navigate({ name: "chat" })}
        accessibilityRole="button"
        accessibilityLabel="Ny samtale"
      >
        <Text style={styles.fabText}>+ Ny samtale</Text>
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
  title: { color: theme.colors.textPrimary, fontSize: 22, fontWeight: "700" },
  headerActions: { flexDirection: "row", gap: theme.spacing.sm },
  headerButton: {
    minHeight: theme.minTouchTarget,
    justifyContent: "center",
    paddingHorizontal: theme.spacing.sm,
  },
  headerButtonText: { color: theme.colors.textSecondary },
  loader: { marginTop: theme.spacing.xl },
  empty: {
    color: theme.colors.textMuted,
    textAlign: "center",
    marginTop: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
  },
  row: {
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: theme.minTouchTarget,
  },
  rowPressed: { backgroundColor: theme.colors.surfaceRaised },
  rowTitle: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: "500" },
  rowMeta: { color: theme.colors.textMuted, fontSize: 12, marginTop: 4 },
  fab: {
    position: "absolute",
    bottom: theme.spacing.lg,
    right: theme.spacing.lg,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.full,
    paddingHorizontal: theme.spacing.lg,
    minHeight: 52,
    justifyContent: "center",
  },
  fabPressed: { opacity: 0.85 },
  fabText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
