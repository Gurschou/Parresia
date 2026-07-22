import { describe, expect, it } from "vitest";
import {
  initialVoiceState,
  MAX_RECONNECT_ATTEMPTS,
  voiceReducer,
  type VoiceEvent,
  type VoiceMachineState,
} from "../src/voice/state-machine";

function run(events: VoiceEvent[], from: VoiceMachineState = initialVoiceState) {
  return events.reduce(voiceReducer, from);
}

describe("voice state machine", () => {
  it("follows the happy path connect -> listen -> speak -> respond -> listen", () => {
    let s = run([{ type: "CONNECT" }]);
    expect(s.status).toBe("connecting");
    s = run([{ type: "CONNECTED" }], s);
    expect(s.status).toBe("listening");
    s = run([{ type: "USER_SPEECH_STARTED" }], s);
    expect(s.status).toBe("user-speaking");
    s = run([{ type: "USER_SPEECH_STOPPED" }], s);
    expect(s.status).toBe("thinking");
    s = run([{ type: "AUDIO_STARTED" }], s);
    expect(s.status).toBe("assistant-speaking");
    s = run([{ type: "AUDIO_DONE" }], s);
    expect(s.status).toBe("listening");
  });

  it("lets the user barge in while the assistant speaks", () => {
    const s = run([
      { type: "CONNECT" },
      { type: "CONNECTED" },
      { type: "AUDIO_STARTED" },
      { type: "USER_SPEECH_STARTED" },
    ]);
    expect(s.status).toBe("user-speaking");
  });

  it("returns to listening after an interruption", () => {
    const s = run([
      { type: "CONNECT" },
      { type: "CONNECTED" },
      { type: "AUDIO_STARTED" },
      { type: "INTERRUPTED" },
    ]);
    expect(s.status).toBe("listening");
  });

  it("bounds reconnect attempts and never loops forever", () => {
    let s = run([{ type: "CONNECT" }, { type: "CONNECTED" }]);
    for (let i = 0; i < MAX_RECONNECT_ATTEMPTS; i++) {
      s = voiceReducer(s, { type: "CONNECTION_LOST" });
      expect(s.status).toBe("reconnecting");
      s = voiceReducer(s, { type: "CONNECTED" });
      expect(s.status).toBe("listening");
    }
    // reconnectAttempts resets on successful connect, so simulate repeated
    // losses without a successful reconnect in between:
    s = run([{ type: "CONNECT" }, { type: "CONNECTED" }]);
    for (let i = 0; i < MAX_RECONNECT_ATTEMPTS; i++) {
      s = voiceReducer(s, { type: "CONNECTION_LOST" });
    }
    expect(s.status).toBe("reconnecting");
    s = voiceReducer(s, { type: "CONNECTION_LOST" });
    expect(s.status).toBe("error");
  });

  it("ignores events while disconnected", () => {
    const s = run([{ type: "AUDIO_STARTED" }, { type: "USER_SPEECH_STARTED" }]);
    expect(s.status).toBe("disconnected");
  });

  it("always honours DISCONNECT", () => {
    const s = run([
      { type: "CONNECT" },
      { type: "CONNECTED" },
      { type: "AUDIO_STARTED" },
      { type: "DISCONNECT" },
    ]);
    expect(s).toEqual(initialVoiceState);
  });
});
