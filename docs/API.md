# SYNAPSE — HTTP API

Base URL: the Next.js app (`apps/web`). All bodies are JSON. Errors follow:

```json
{ "error": { "code": "VALIDATION | NOT_FOUND | INTERNAL", "message": "…" } }
```

## POST /api/chat

Send a message. Omit `sessionId` (or send a stale one) to start a new session automatically.

Request:

```json
{ "sessionId": "ses_…", "message": "Jeg udskyder en svær samtale" }
```

Response `200`:

```json
{
  "sessionId": "ses_…",
  "reply": {
    "content": "…",
    "agent": "coach",
    "model": "anthropic/claude-sonnet-4-20250514",
    "decision": null
  },
  "emotion": {
    "primaryEmotion": "fear",
    "stress": 0.7,
    "energy": 0.4,
    "clarity": 0.4
  }
}
```

`reply.decision` carries the full `DecisionAnalysis` artifact when the decision agent served the turn. `emotion` is `null` if emotional analysis failed (the reply still succeeds).

## POST /api/session/end

Ends a session: runs reflection, stores insights/commitments, extracts durable memories, then discards the session.

Request: `{ "sessionId": "ses_…" }`

Response `200`:

```json
{
  "reflection": {
    "insights": ["…"],
    "commitments": [{ "action": "…", "due": "2026-07-06" }],
    "carryForwardQuestion": "…",
    "summary": "…"
  }
}
```

`404` if the session does not exist.

## GET /api/metrics

Current growth metrics for the dashboard. All values 0–100.

```json
{
  "metrics": {
    "growthScore": 62,
    "mentalPerformance": 71,
    "emotionalPerformance": 64,
    "decisionQuality": 58,
    "reflectionScore": 50,
    "learningVelocity": 45,
    "identityAlignment": 60,
    "focus": 66,
    "energy": 55,
    "stress": 38
  }
}
```

## GET /api/patterns

Detected patterns, sorted by confidence.

```json
{
  "patterns": [
    {
      "id": "pat_…",
      "category": "self-sabotage",
      "label": "Udskyder svære samtaler",
      "evidence": ["…"],
      "why": "Konfliktundvigelse beskytter mod frygten for afvisning",
      "suggestedShift": "Book samtalen inden for 24 timer",
      "stage": "detected",
      "confidence": 0.7,
      "occurrences": 3,
      "firstSeenAt": "…",
      "lastSeenAt": "…"
    }
  ]
}
```
