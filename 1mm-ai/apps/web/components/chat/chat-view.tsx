"use client";

import { useCallback } from "react";
import { voiceStatusLabels } from "@1mm/shared";
import { notifyConversationsChanged } from "@/components/sidebar";
import { useVoiceSession } from "@/components/voice/use-voice-session";
import { VoicePanel } from "@/components/voice/voice-panel";
import { Composer } from "./composer";
import { MessageList } from "./message-list";
import { useChat, type UiMessage } from "./use-chat";

interface ChatViewProps {
  initialConversationId?: string;
  initialTitle?: string | null;
  initialMessages?: UiMessage[];
}

export function ChatView({ initialConversationId, initialTitle, initialMessages }: ChatViewProps) {
  const chat = useChat({ initialConversationId, initialMessages });

  const ensureConversationId = useCallback(async (): Promise<string> => {
    if (chat.conversationId) return chat.conversationId;
    const response = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "voice" }),
    });
    if (!response.ok) throw new Error("could not create conversation");
    const body = (await response.json()) as { conversation: { id: string } };
    window.history.replaceState(null, "", `/chat/${body.conversation.id}`);
    notifyConversationsChanged();
    return body.conversation.id;
  }, [chat.conversationId]);

  const voice = useVoiceSession({
    onFinalTranscript: chat.appendTranscript,
    ensureConversationId,
  });

  const title =
    initialTitle ??
    (chat.messages.find((m) => m.role === "user")?.content.slice(0, 60) || "Ny samtale");

  return (
    <div className="flex h-full flex-col">
      {/* Header: title + connection status */}
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3 pl-14 md:pl-4">
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h1>
        <p className="shrink-0 text-xs text-text-secondary" role="status">
          {voice.active
            ? voiceStatusLabels[voice.status]
            : chat.status === "streaming"
              ? "Skriver…"
              : "Klar"}
        </p>
      </header>

      <MessageList
        messages={chat.messages}
        streaming={chat.status === "streaming"}
        activeTool={chat.activeTool}
        error={chat.error}
        onRetry={chat.retry}
        onSuggestion={(text) => void chat.sendMessage(text)}
      />

      {voice.active && (
        <VoicePanel
          status={voice.status}
          muted={voice.muted}
          pushToTalk={voice.pushToTalk}
          liveTranscripts={voice.liveTranscripts}
          errorMessage={voice.error?.message ?? null}
          onToggleMute={voice.toggleMute}
          onTogglePushToTalk={voice.togglePushToTalk}
          onPttPress={voice.pttPress}
          onPttRelease={voice.pttRelease}
          onInterrupt={voice.interrupt}
          onEnd={() => void voice.stop()}
        />
      )}

      <Composer
        disabled={false}
        streaming={chat.status === "streaming"}
        voiceActive={voice.active}
        onSend={(text) => {
          // Text typed during a voice call goes into the live session too.
          void chat.sendMessage(text);
        }}
        onStop={() => void chat.stop()}
        onToggleVoice={() => {
          if (voice.active) void voice.stop();
          else void voice.start();
        }}
      />
    </div>
  );
}
