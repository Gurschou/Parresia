import { useCallback, useRef, useState } from "react";
import { createSseParser } from "@1mm/shared";
import { apiFetch, apiStream } from "../api/client";

export interface MobileMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "completed" | "streaming" | "failed";
  createdAt: string;
}

/** Mobile chat engine: mirrors the web behaviour on top of expo/fetch. */
export function useMobileChat(initialConversationId?: string) {
  const [conversationId, setConversationId] = useState<string | undefined>(initialConversationId);
  const [messages, setMessages] = useState<MobileMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;
  const lastUserTextRef = useRef<string | null>(null);

  const loadHistory = useCallback(async (id: string) => {
    const body = await apiFetch<{
      messages: {
        id: string;
        role: string;
        content: string;
        status: string;
        createdAt: string;
      }[];
    }>(`/api/conversations/${id}`);
    setMessages(
      body.messages
        .filter((m) => (m.role === "user" || m.role === "assistant") && m.status !== "failed")
        .map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          status: "completed" as const,
          createdAt: m.createdAt,
        })),
    );
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || abortRef.current) return;
    setError(null);
    lastUserTextRef.current = trimmed;

    const now = new Date().toISOString();
    const tempAssistantId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", content: trimmed, status: "completed", createdAt: now },
      { id: tempAssistantId, role: "assistant", content: "", status: "streaming", createdAt: now },
    ]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const fail = (message: string, retryable: boolean) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempAssistantId ? { ...m, status: "failed" as const } : m)),
      );
      setError({ message, retryable });
    };

    try {
      const response = await apiStream(
        "/api/chat",
        { conversationId: conversationIdRef.current, message: trimmed },
        controller.signal,
      );
      if (!response.body) {
        fail("Serveren streamede ikke svaret.", true);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = createSseParser();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const event of parser.push(decoder.decode(value, { stream: true }))) {
          if (event.type === "message.created") {
            conversationIdRef.current = event.conversationId;
            setConversationId(event.conversationId);
          } else if (event.type === "delta") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAssistantId ? { ...m, content: m.content + event.text } : m,
              ),
            );
          } else if (event.type === "done") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAssistantId ? { ...m, status: "completed" as const } : m,
              ),
            );
          } else if (event.type === "error") {
            fail(event.message, event.retryable);
          }
        }
      }
      // Treat an early close (stop) as a completed partial answer.
      setMessages((prev) =>
        prev.map((m) => (m.status === "streaming" ? { ...m, status: "completed" as const } : m)),
      );
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setMessages((prev) =>
          prev.map((m) => (m.status === "streaming" ? { ...m, status: "completed" as const } : m)),
        );
      } else {
        fail(err instanceof Error ? err.message : "Forbindelsen blev afbrudt.", true);
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
    }
  }, []);

  const stop = useCallback(async () => {
    const id = conversationIdRef.current;
    if (id) {
      try {
        await apiFetch("/api/chat/stop", { body: { conversationId: id } });
      } catch {
        // Fall through to the local abort below.
      }
    }
    setTimeout(() => abortRef.current?.abort(), 1_500);
  }, []);

  const retry = useCallback(() => {
    const text = lastUserTextRef.current;
    if (!text) return;
    setMessages((prev) => {
      const withoutFailed = prev.filter((m) => m.status !== "failed");
      if (withoutFailed.at(-1)?.role === "user") return withoutFailed.slice(0, -1);
      return withoutFailed;
    });
    setError(null);
    void sendMessage(text);
  }, [sendMessage]);

  return { conversationId, messages, streaming, error, sendMessage, stop, retry, loadHistory };
}
