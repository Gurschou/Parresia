import type { TranscriptEvent, VoiceError, VoiceStatus, VoiceTransport } from "@1mm/shared";

/**
 * Mobile voice status (honest limitation, documented in docs/mobile-voice.md):
 *
 * The OpenAI Realtime API's WebRTC transport relies on browser APIs
 * (RTCPeerConnection, navigator.mediaDevices) that DO NOT exist in React
 * Native. Verified against the current OpenAI Agents SDK: its WebRTC
 * transport targets browsers only. A stable native path requires
 * `react-native-webrtc` inside an Expo development build (not Expo Go),
 * or a server-side WebSocket voice bridge.
 *
 * Until that is validated on real devices, voice on mobile ships behind
 * this feature flag, isolated behind the shared VoiceTransport interface.
 * Flipping the flag later only requires providing a real transport here –
 * the UI and backend (short-lived token endpoint) are already in place.
 */
export const MOBILE_VOICE_ENABLED = false;

/** Guard against assuming browser APIs exist in this runtime. */
export function isNativeWebRtcAvailable(): boolean {
  const g = globalThis as { RTCPeerConnection?: unknown; navigator?: { mediaDevices?: unknown } };
  return typeof g.RTCPeerConnection === "function" && g.navigator?.mediaDevices !== undefined;
}

/** Placeholder transport: reports the platform limitation through onError. */
export class UnsupportedVoiceTransport implements VoiceTransport {
  private errorListeners = new Set<(error: VoiceError) => void>();
  private statusListeners = new Set<(status: VoiceStatus) => void>();

  async connect(): Promise<void> {
    for (const listener of this.statusListeners) listener("error");
    for (const listener of this.errorListeners) {
      listener({
        code: "unsupported-platform",
        message:
          "Stemmesamtaler på mobil kræver en kommende opdatering (native WebRTC). Brug tekstchatten – eller stemme på web.",
        recoverable: false,
      });
    }
  }

  async disconnect(): Promise<void> {
    for (const listener of this.statusListeners) listener("disconnected");
  }

  setMuted(_muted: boolean): void {}

  async sendText(_text: string): Promise<void> {}

  interrupt(): void {}

  onStatus(listener: (status: VoiceStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onTranscript(_listener: (event: TranscriptEvent) => void): () => void {
    return () => undefined;
  }

  onError(listener: (error: VoiceError) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }
}

/** Factory the UI uses – swap the implementation here when voice ships. */
export function createMobileVoiceTransport(): VoiceTransport {
  return new UnsupportedVoiceTransport();
}
