"use client";

import { useCallback, useRef, useState } from "react";
import { createSseParser, type ChatMessage } from "@1mm/shared";
import { notifyConversationsChanged } from "@/components/sidebar";

export type ChatStatus = "idle" | "streaming";

export interface UiMessage extends Pick<ChatMessage, "role" | "content" | "status"> {
  id: string;
  messageType: ChatMessage["messageType"];
  createdAt: string;
  toolName?: string;
}

interface UseChatOptions {
  initialConversationId?: string;
  initialMessages?: UiMessage[];
}

/**
 * Client-side chat engine: sends messages, consumes the SSE stream, exposes
 * stop/retry, and keeps the URL + sidebar in sync for new conversations.
 */
export function useChat(options: UseChatOptions) {
  const [conversationId, setConversationId] = useState<string | undefined>(
    options.initialConversationId,
  );
  const [messages, setMessages] = useState<UiMessage[]>(options.initialMessages ?? []);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;
  const lastUserTextRef = useRef<string | null>(null);

  const appendTranscript = useCallback((role: "user" | "assistant", content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `voice-${crypto.randomUUID()}`,
        role,
        content,
        status: "completed",
        messageType: "transcript",
        createdAt: new Date().toISOString(),
      },
    ]);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || abortRef.current) return;

      setError(null);
      lastUserTextRef.current = trimmed;

      const tempUserId = `temp-user-${crypto.randomUUID()}`;
      const tempAssistantId = `temp-assistant-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      setMessages((prev) => [
        ...prev,
        {
          id: tempUserId,
          role: "user",
          content: trimmed,
          status: "completed",
          messageType: "text",
          createdAt: now,
        },
        {
          id: tempAssistantId,
          role: "assistant",
          content: "",
          status: "streaming",
          messageType: "text",
          createdAt: now,
        },
      ]);
      setStatus("streaming");

      const controller = new AbortController();
      abortRef.current = controller;
      const idempotencyKey = crypto.randomUUID();

      const failLocally = (message: string, retryable: boolean) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempAssistantId ? { ...m, status: "failed" as const } : m)),
        );
        setError({ message, retryable });
      };

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: conversationIdRef.current,
            message: trimmed,
            idempotencyKey,
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const body = (await response.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          failLocally(body?.error?.message ?? "Kunne ikke sende beskeden.", true);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const parser = createSseParser();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const event of parser.push(decoder.decode(value, { stream: true }))) {
            switch (event.type) {
              case "message.created": {
                const isNew = !conversationIdRef.current;
                conversationIdRef.current = event.conversationId;
                setConversationId(event.conversationId);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === tempUserId
                      ? { ...m, id: event.userMessageId }
                      : m.id === tempAssistantId
                        ? { ...m, id: event.assistantMessageId }
                        : m,
                  ),
                );
                if (isNew) {
                  // Keep the URL shareable without a full navigation mid-stream.
                  window.history.replaceState(null, "", `/chat/${event.conversationId}`);
                  notifyConversationsChanged();
                }
                break;
              }
              case "delta":
                setMessages((prev) =>
                  prev.map((m) =>
                    m.status === "streaming" && m.role === "assistant"
                      ? { ...m, content: m.content + event.text }
                      : m,
                  ),
                );
                break;
              case "tool.started":
                setActiveTool(event.toolName);
                break;
              case "tool.finished":
                setActiveTool(null);
                break;
              case "conversation.title":
                notifyConversationsChanged();
                break;
              case "done":
                setMessages((prev) =>
                  prev.map((m) =>
                    m.status === "streaming" ? { ...m, status: "completed" as const } : m,
                  ),
                );
                break;
              case "error":
                failLocally(event.message, event.retryable);
                break;
            }
          }
        }

        // Stream ended without an explicit done (e.g. stopped) – finalize.
        setMessages((prev) =>
          prev.map((m) => (m.status === "streaming" ? { ...m, status: "completed" as const } : m)),
        );
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          // Local abort: keep partial text, mark as completed.
          setMessages((prev) =>
            prev.map((m) =>
              m.status === "streaming" ? { ...m, status: "completed" as const } : m,
            ),
          );
        } else {
          failLocally("Forbindelsen blev afbrudt. Prøv igen.", true);
        }
      } finally {
        abortRef.current = null;
        setActiveTool(null);
        setStatus("idle");
        notifyConversationsChanged();
      }
    },
    [],
  );

  const stop = useCallback(async () => {
    // Server-side stop persists the partial answer, then the stream closes.
    const id = conversationIdRef.current;
    if (id) {
      void fetch("/api/chat/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id }),
      }).catch(() => undefined);
    }
    // Also abort locally in case the server never received the request.
    setTimeout(() => abortRef.current?.abort(), 1_500);
  }, []);

  const retry = useCallback(() => {
    const text = lastUserTextRef.current;
    if (!text) return;
    // Remove the failed turn from view before resending.
    setMessages((prev) => {
      const withoutFailed = prev.filter((m) => m.status !== "failed");
      // Also drop the trailing user message that belongs to the failed turn.
      if (withoutFailed.length > 0 && withoutFailed[withoutFailed.length - 1]?.role === "user") {
        return withoutFailed.slice(0, -1);
      }
      return withoutFailed;
    });
    setError(null);
    void sendMessage(text);
  }, [sendMessage]);

  return {
    conversationId,
    messages,
    status,
    error,
    activeTool,
    sendMessage,
    stop,
    retry,
    appendTranscript,
  };
}
