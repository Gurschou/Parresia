/**
 * Pure voice-session state machine. Keeping transitions here (with no I/O)
 * makes the connection lifecycle unit-testable and identical on web + mobile.
 */

export type VoiceStatus =
  | "disconnected"
  | "connecting"
  | "listening"
  | "user-speaking"
  | "thinking"
  | "assistant-speaking"
  | "reconnecting"
  | "error";

export type VoiceEvent =
  | { type: "CONNECT" }
  | { type: "CONNECTED" }
  | { type: "USER_SPEECH_STARTED" }
  | { type: "USER_SPEECH_STOPPED" }
  | { type: "RESPONSE_STARTED" }
  | { type: "AUDIO_STARTED" }
  | { type: "AUDIO_DONE" }
  | { type: "INTERRUPTED" }
  | { type: "CONNECTION_LOST" }
  | { type: "RECONNECT" }
  | { type: "DISCONNECT" }
  | { type: "FATAL_ERROR" };

export interface VoiceMachineState {
  status: VoiceStatus;
  reconnectAttempts: number;
}

export const MAX_RECONNECT_ATTEMPTS = 3;

export const initialVoiceState: VoiceMachineState = {
  status: "disconnected",
  reconnectAttempts: 0,
};

const ACTIVE: readonly VoiceStatus[] = [
  "listening",
  "user-speaking",
  "thinking",
  "assistant-speaking",
];

export function voiceReducer(state: VoiceMachineState, event: VoiceEvent): VoiceMachineState {
  const { status } = state;

  switch (event.type) {
    case "CONNECT":
      if (status === "disconnected" || status === "error") {
        return { status: "connecting", reconnectAttempts: 0 };
      }
      return state;

    case "CONNECTED":
      if (status === "connecting" || status === "reconnecting") {
        return { status: "listening", reconnectAttempts: 0 };
      }
      return state;

    case "USER_SPEECH_STARTED":
      // The user can barge in while the assistant is speaking or thinking.
      if (ACTIVE.includes(status)) return { ...state, status: "user-speaking" };
      return state;

    case "USER_SPEECH_STOPPED":
      if (status === "user-speaking") return { ...state, status: "thinking" };
      return state;

    case "RESPONSE_STARTED":
      if (ACTIVE.includes(status)) return { ...state, status: "thinking" };
      return state;

    case "AUDIO_STARTED":
      if (ACTIVE.includes(status)) return { ...state, status: "assistant-speaking" };
      return state;

    case "AUDIO_DONE":
      if (status === "assistant-speaking" || status === "thinking") {
        return { ...state, status: "listening" };
      }
      return state;

    case "INTERRUPTED":
      if (status === "assistant-speaking" || status === "thinking") {
        return { ...state, status: "listening" };
      }
      return state;

    case "CONNECTION_LOST": {
      if (status === "disconnected" || status === "error") return state;
      // Bounded reconnects: never loop forever.
      if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        return { status: "error", reconnectAttempts: state.reconnectAttempts };
      }
      return { status: "reconnecting", reconnectAttempts: state.reconnectAttempts + 1 };
    }

    case "RECONNECT":
      if (status === "reconnecting") return state;
      return state;

    case "DISCONNECT":
      return { status: "disconnected", reconnectAttempts: 0 };

    case "FATAL_ERROR":
      return { status: "error", reconnectAttempts: state.reconnectAttempts };

    default:
      return state;
  }
}

/** Human-friendly labels (Danish product language, no technical jargon). */
export const voiceStatusLabels: Record<VoiceStatus, string> = {
  disconnected: "Ikke forbundet",
  connecting: "Forbinder…",
  listening: "Lytter",
  "user-speaking": "Du taler",
  thinking: "Tænker…",
  "assistant-speaking": "1MM AI taler",
  reconnecting: "Genopretter forbindelsen…",
  error: "Der opstod en fejl",
};
