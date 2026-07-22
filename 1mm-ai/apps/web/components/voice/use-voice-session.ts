"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TranscriptEvent, VoiceError, VoiceStatus } from "@1mm/shared";
import { WebVoiceTransport } from "@/lib/voice/web-transport";

export interface LiveTranscript {
  role: "user" | "assistant";
  text: string;
}

interface UseVoiceSessionOptions {
  /** Called when a final transcript should be added to the chat view. */
  onFinalTranscript(role: "user" | "assistant", text: string): void;
  /** Returns the conversation id, creating the conversation if needed. */
  ensureConversationId(): Promise<string>;
}

/**
 * React wrapper around WebVoiceTransport: lifecycle, mute, push-to-talk and
 * persistence of finished transcripts. The transport is torn down (mic and
 * peer connection closed) on unmount.
 */
export function useVoiceSession(options: UseVoiceSessionOptions) {
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>("disconnected");
  const [muted, setMuted] = useState(false);
  const [pushToTalk, setPushToTalk] = useState(false);
  const [error, setError] = useState<VoiceError | null>(null);
  const [liveTranscripts, setLiveTranscripts] = useState<LiveTranscript[]>([]);

  const transportRef = useRef<WebVoiceTransport | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const partialsRef = useRef(new Map<string, string>());
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const persistTranscript = useCallback(async (role: "user" | "assistant", text: string) => {
    const conversationId = conversationIdRef.current;
    if (!conversationId || !text.trim()) return;
    try {
      await fetch("/api/realtime/transcripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, role, content: text.trim() }),
      });
    } catch {
      // Persistence failure must not break the live call.
    }
  }, []);

  const handleTranscript = useCallback(
    (event: TranscriptEvent) => {
      if (event.final) {
        partialsRef.current.delete(`${event.role}:${event.itemId}`);
        setLiveTranscripts((prev) => prev.filter((t) => t.role !== event.role));
        if (event.text.trim()) {
          optionsRef.current.onFinalTranscript(event.role, event.text.trim());
          void persistTranscript(event.role, event.text);
        }
        return;
      }
      const key = `${event.role}:${event.itemId}`;
      const combined = (partialsRef.current.get(key) ?? "") + event.text;
      partialsRef.current.set(key, combined);
      setLiveTranscripts((prev) => {
        const others = prev.filter((t) => t.role !== event.role);
        return [...others, { role: event.role, text: combined }];
      });
    },
    [persistTranscript],
  );

  const start = useCallback(async () => {
    if (transportRef.current) return;
    setError(null);
    setLiveTranscripts([]);
    partialsRef.current.clear();

    let conversationId: string;
    try {
      conversationId = await optionsRef.current.ensureConversationId();
    } catch {
      setError({
        code: "unknown",
        message: "Samtalen kunne ikke oprettes. Prøv igen.",
        recoverable: true,
      });
      return;
    }
    conversationIdRef.current = conversationId;

    const transport = new WebVoiceTransport({ conversationId });
    transportRef.current = transport;
    transport.onStatus(setStatus);
    transport.onTranscript(handleTranscript);
    transport.onError((err) => {
      setError(err);
      if (!err.recoverable) {
        void transport.disconnect();
        transportRef.current = null;
        setActive(false);
      }
    });

    setActive(true);
    await transport.connect();
  }, [handleTranscript]);

  const stop = useCallback(async () => {
    const transport = transportRef.current;
    transportRef.current = null;
    conversationIdRef.current = null;
    setActive(false);
    setLiveTranscripts([]);
    setMuted(false);
    if (transport) await transport.disconnect();
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      transportRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const interrupt = useCallback(() => {
    transportRef.current?.interrupt();
  }, []);

  /** Push-to-talk: mic stays muted except while the button is held. */
  const togglePushToTalk = useCallback(() => {
    setPushToTalk((prev) => {
      const next = !prev;
      transportRef.current?.setMuted(next);
      setMuted(next);
      return next;
    });
  }, []);

  const pttPress = useCallback(() => {
    transportRef.current?.setMuted(false);
    setMuted(false);
  }, []);

  const pttRelease = useCallback(() => {
    transportRef.current?.setMuted(true);
    setMuted(true);
  }, []);

  // Hard cleanup on unmount: stop mic tracks, close peer connection.
  useEffect(() => {
    return () => {
      void transportRef.current?.disconnect();
      transportRef.current = null;
    };
  }, []);

  return {
    active,
    status,
    muted,
    pushToTalk,
    error,
    liveTranscripts,
    start,
    stop,
    toggleMute,
    togglePushToTalk,
    pttPress,
    pttRelease,
    interrupt,
  };
}
