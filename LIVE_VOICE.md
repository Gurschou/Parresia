# 1MM Live Voice

The web interface implements a ChatGPT Live-style voice conversation using
the OpenAI Realtime API and browser WebRTC.

## Configuration

Set these variables in the Vercel project's Production and Preview
environments — never expose `OPENAI_API_KEY` to the browser:

```sh
OPENAI_API_KEY=...
# Optional:
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_REALTIME_VOICE=marin
```

`POST /voice/realtime/session` is the only endpoint that reads
`OPENAI_API_KEY`. It exchanges it for a short-lived `client_secret`, binds
that secret to an HMAC-pseudonymised safety identifier, and returns only the
ephemeral secret to the browser. The browser then establishes a WebRTC
connection directly with OpenAI. Raw microphone audio and SDP never pass
through the 1MM application server.

## Behaviour

- Browser-native WebRTC streams microphone audio and plays model audio.
- Semantic VAD automatically detects turns.
- `interrupt_response: true` enables barge-in: speaking while 1MM responds
  stops the in-progress reply.
- Input and output transcripts appear in the visible conversation.
- The UI requires an explicit voice-processing consent checkbox before it
  asks for a session credential.

## Emotional-intelligence policy

The realtime session includes an explicit behavioural policy — it is not a
claim that the model can detect or possess emotions. 1MM:

- reflects explicitly shared feelings tentatively and briefly before trying
  to solve a problem;
- validates the experience without validating a catastrophic or harmful
  conclusion;
- matches conversational intensity, offers choice (listen, perspective, or
  a concrete step), asks permission before going deeper, and preserves the
  athlete's agency;
- avoids mind-reading, therapy imitation, emotional dependency, pressure,
  flattery and inferred emotion scores;
- stops performance coaching and directs the person to immediate local help
  for emergency or self-harm signals.

No inferred emotional state is persisted or presented as fact.

## Privacy boundary

No raw audio is persisted by this implementation. Transcripts are rendered
in the active browser session only; they are not yet written to the Digital
Twin Event Log.

That last boundary is deliberate: the current web app is a FastAPI prototype
while the GDPR-compliant data layer is a separate TypeScript/Drizzle package
in `datalayer/`. Claiming that a browser checkbox alone records versioned,
purpose-specific consent or that the prototype persists redacted transcript
events would be incorrect. Before persistent transcripts are enabled, wire
the authenticated web session to `datalayer`'s consent service and append a
strictly Zod-validated, redacted `conversation.transcript` event only when
the relevant consent is current.
