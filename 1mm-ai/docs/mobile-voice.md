# Mobil voice – status og plan

## Ærlig status

Live voice på iOS/Android er **ikke aktiveret** i MVP'en. Funktionen er isoleret bag det delte `VoiceTransport`-interface (`packages/shared/src/voice/transport.ts`) og feature-flaget `MOBILE_VOICE_ENABLED` i `apps/mobile/src/voice/native-voice-transport.ts`. Tekstchatten er fuldt fungerende på mobil.

## Hvorfor

Undersøgt før beslutningen:

1. **OpenAI Realtime via WebRTC kræver browser-API'er.** Både den officielle WebRTC-vejledning og Agents SDK'ens WebRTC-transport bruger `RTCPeerConnection` og `navigator.mediaDevices`, som ikke findes i React Native-runtimen. `isNativeWebRtcAvailable()` tjekker eksplicit for dem i stedet for at antage, at de findes.
2. **`react-native-webrtc` kan levere API'erne**, men er et native modul, der ikke findes i Expo Go – det kræver et Expo development build (`npx expo prebuild` + `expo run:ios/android`) og reel enhedstest af audio-sessions (AVAudioSession på iOS, AudioManager på Android), echo-cancellation og baggrundsadfærd. Det kunne ikke verificeres stabilt uden fysiske enheder.
3. At skibe en uverificeret voice-sti ville bryde princippet om kun at levere fungerende funktioner.

## Anbefalet vej frem (prioriteret)

### A. Native WebRTC i et development build

1. Tilføj `react-native-webrtc` + `@config-plugins/react-native-webrtc`.
2. Byg med `npx expo prebuild` og `expo run:ios` / `expo run:android` (Expo Go rækker ikke).
3. Implementér `NativeVoiceTransport` med samme serverflow som web:
   - `POST /api/realtime/session` → kortlivet `ek_…`-token (endpointet genbruges 1:1).
   - SDP-udveksling mod `https://api.openai.com/v1/realtime/calls`.
   - Samme event-håndtering og state machine som `WebVoiceTransport` – logikken kan i vid udstrækning deles.
4. Håndtér audio-session: `InCallManager` eller tilsvarende til højtaler/earpiece, mikrofonrettigheder er allerede deklareret i `app.json`.
5. Slå `MOBILE_VOICE_ENABLED` til.

### B. Alternativ: server-side WebSocket voice bridge

Hvis native WebRTC viser sig ustabil: en Node-tjeneste, der taler WebSocket med OpenAI Realtime (server-side, normal API-nøgle) og et simpelt audio-over-WebSocket-protokol med appen (fx 16-bit PCM-chunks via `expo-audio`-optagelse). Fordele: ingen native moduler, fuld serverkontrol. Ulemper: højere latenstid, egen jitter-/afspilningshåndtering. Sikkerhedsmodellen er uændret – API-nøglen bliver på serveren.

## Kontrakten der skal opfyldes

```ts
interface VoiceTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  setMuted(muted: boolean): void;
  sendText(text: string): Promise<void>;
  interrupt(): void;
  onStatus(listener: (status: VoiceStatus) => void): () => void;
  onTranscript(listener: (event: TranscriptEvent) => void): () => void;
  onError(listener: (error: VoiceError) => void): () => void;
}
```

UI'et (mikrofonknap, status, transskription) og backend (token-endpoint, transcript-persistens) er allerede på plads – kun transporten mangler.
