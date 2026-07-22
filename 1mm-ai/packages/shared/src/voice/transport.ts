import type { VoiceStatus } from "./state-machine";

/** A transcript fragment or completed utterance from either side of the call. */
export interface TranscriptEvent {
  role: "user" | "assistant";
  text: string;
  /** false while words are still arriving, true when the utterance is final. */
  final: boolean;
  /** Correlates deltas belonging to the same utterance. */
  itemId: string;
}

export interface VoiceError {
  code:
    | "microphone-denied"
    | "token-failed"
    | "connection-failed"
    | "connection-lost"
    | "unsupported-platform"
    | "unknown";
  message: string;
  recoverable: boolean;
}

/**
 * Platform-agnostic contract for a live voice session. The web app implements
 * it with browser WebRTC; mobile provides its own implementation (or a stub
 * behind a feature flag when native WebRTC is unavailable).
 */
export interface VoiceTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  setMuted(muted: boolean): void;
  /** Send a typed message into the live session (text+voice in one conversation). */
  sendText(text: string): Promise<void>;
  /** Manually interrupt the assistant while it is speaking. */
  interrupt(): void;
  onStatus(listener: (status: VoiceStatus) => void): () => void;
  onTranscript(listener: (event: TranscriptEvent) => void): () => void;
  onError(listener: (error: VoiceError) => void): () => void;
}
