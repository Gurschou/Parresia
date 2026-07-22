import { useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LIMITS } from "@1mm/shared";
import { useMobileChat, type MobileMessage } from "../chat/use-mobile-chat";
import { useNavigation } from "../navigation";
import { theme } from "../theme";
import { createMobileVoiceTransport, MOBILE_VOICE_ENABLED } from "../voice/native-voice-transport";

interface ChatScreenProps {
  conversationId?: string;
}

export function ChatScreen({ conversationId }: ChatScreenProps) {
  const { back } = useNavigation();
  const chat = useMobileChat(conversationId);
  const [input, setInput] = useState("");
  const listRef = useRef<FlatList<MobileMessage>>(null);

  useEffect(() => {
    if (conversationId) {
      chat.loadHistory(conversationId).catch(() => {
        Alert.alert("Fejl", "Samtalen kunne ikke hentes.");
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    void chat.sendMessage(text);
  }

  function onVoicePress() {
    if (!MOBILE_VOICE_ENABLED) {
      // The transport itself reports the limitation – reuse its message.
      const transport = createMobileVoiceTransport();
      const unsubscribe = transport.onError((error) => {
        Alert.alert("Stemme", error.message);
        unsubscribe();
      });
      void transport.connect();
      return;
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Pressable
          onPress={back}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Tilbage"
        >
          <Text style={styles.backText}>‹ Tilbage</Text>
        </Pressable>
        <Text style={styles.status} accessibilityLiveRegion="polite">
          {chat.streaming ? "Skriver…" : "Klar"}
        </Text>
      </View>

      <FlatList
        ref={listRef}
        data={chat.messages.filter((m) => m.status !== "failed")}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Hvad kan jeg hjælpe med?</Text>
            <Text style={styles.emptyText}>Skriv en besked for at starte samtalen.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.aiBubble]}>
            <Text style={styles.bubbleText}>
              {item.content || (item.status === "streaming" ? "…" : "")}
            </Text>
          </View>
        )}
      />

      {chat.error && (
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>{chat.error.message}</Text>
          {chat.error.retryable && (
            <Pressable onPress={chat.retry} accessibilityRole="button" style={styles.retryButton}>
              <Text style={styles.retryText}>Prøv igen</Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Skriv til 1MM AI…"
          placeholderTextColor={theme.colors.textMuted}
          multiline
          maxLength={LIMITS.maxMessageLength}
          accessibilityLabel="Skriv en besked til 1MM AI"
        />
        <Pressable
          onPress={onVoicePress}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Start stemmesamtale"
        >
          <Text style={styles.iconText}>🎙</Text>
        </Pressable>
        {chat.streaming ? (
          <Pressable
            onPress={() => void chat.stop()}
            style={[styles.iconButton, styles.stopButton]}
            accessibilityRole="button"
            accessibilityLabel="Stop generering"
          >
            <Text style={styles.iconText}>■</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={send}
            style={[styles.iconButton, styles.sendButton]}
            disabled={!input.trim()}
            accessibilityRole="button"
            accessibilityLabel="Send besked"
          >
            <Text style={styles.iconText}>➤</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: { minHeight: theme.minTouchTarget, justifyContent: "center" },
  backText: { color: theme.colors.accent, fontSize: 16 },
  status: { color: theme.colors.textSecondary, fontSize: 13 },
  listContent: { padding: theme.spacing.md, gap: theme.spacing.sm },
  emptyBox: { alignItems: "center", marginTop: theme.spacing.xl },
  emptyTitle: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: "600" },
  emptyText: { color: theme.colors.textSecondary, marginTop: 4 },
  bubble: {
    maxWidth: "85%",
    borderRadius: theme.radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: { alignSelf: "flex-end", backgroundColor: theme.colors.userBubble },
  aiBubble: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.assistantBubble,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  bubbleText: { color: theme.colors.textPrimary, fontSize: 15, lineHeight: 21 },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: "rgba(248,113,113,0.1)",
  },
  errorText: { color: theme.colors.danger, flex: 1, marginRight: theme.spacing.sm },
  retryButton: { minHeight: theme.minTouchTarget, justifyContent: "center" },
  retryText: { color: theme.colors.accent, fontWeight: "600" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  input: {
    flex: 1,
    minHeight: theme.minTouchTarget,
    maxHeight: 120,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    color: theme.colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButton: { backgroundColor: theme.colors.primary },
  stopButton: { backgroundColor: theme.colors.danger },
  iconText: { color: "#fff", fontSize: 18 },
});
