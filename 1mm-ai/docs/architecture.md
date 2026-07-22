# Arkitektur

## Overblik

1MM AI er et pnpm/Turborepo-monorepo. Next.js-appen (`apps/web`) er både webklient og API-server; mobilappen (`apps/mobile`) er en ren klient mod de samme API-ruter. Al AI- og datalogik ligger i delte pakker.

```
┌─────────────┐        ┌──────────────────────────────┐
│ apps/mobile │──HTTP──▶                              │
└─────────────┘        │  apps/web (Next.js)          │      ┌────────────┐
┌─────────────┐        │  · UI (App Router)           │──────▶ PostgreSQL │
│ Browser     │──HTTP──▶  · API-ruter (/api/…)        │      │ + pgvector │
└──────┬──────┘        │  · lib/chat-service          │      └────────────┘
       │               └──────────┬───────────────────┘
       │ WebRTC (ephemeral token) │ openai SDK (server-only)
       ▼                          ▼
┌──────────────────── OpenAI ────────────────────────┐
│ Responses API · Realtime API · Embeddings          │
└────────────────────────────────────────────────────┘
```

## Pakker

| Pakke | Ansvar |
| --- | --- |
| `@1mm/shared` | Domænetyper, Zod-skemaer, grænseværdier, voice-state-machine (ren funktion), SSE-parser, `VoiceTransport`-interface |
| `@1mm/database` | Drizzle-skema, migrations, pgvector, klient-singleton, PGlite-testhjælper |
| `@1mm/ai` | `AIProvider`-interface + OpenAI/mock-implementering, systeminstruktion, promptbygning, memory-udtræk/-ranking/-dedup, tool-registry |
| `@1mm/ui` | Design-tokens delt mellem web (Tailwind) og mobil (StyleSheet) |
| `@1mm/config` | Fælles tsconfig-baser |

## Tekstchat-flow

1. Klienten POSTer `{conversationId?, message, idempotencyKey}` til `/api/chat`.
2. `runChatTurn` (i `apps/web/lib/chat-service.ts`):
   - Verificerer/opretter samtalen (altid filtreret på bruger-id).
   - Afviser dubletter via idempotency-nøglen (unik DB-constraint).
   - Gemmer brugerbeskeden, opretter assistentbeskeden med status `streaming`.
   - Bygger kontekst: seneste beskeder (maks. 20) + rullende resumé + de mest relevante memories (pgvector + ranking).
   - Streamer fra provideren; tool-kald udføres server-side fra allowlisten og føres tilbage til modellen.
   - Afslutter beskeden som `completed`/`failed`, logger usage-metrics, genererer titel og opdaterer resumé og memories.
3. Events sendes som SSE (`message.created`, `delta`, `tool.*`, `conversation.title`, `done`, `error`).
4. Stop: `/api/chat/stop` aborter serverens AbortController; det delvise svar gemmes.

## Voice-flow (web)

1. Klienten beder om mikrofonadgang og kalder `/api/realtime/session` (kræver login, rate-limitet).
2. Backend bygger instruktioner (systemprompt + memories + resumé) og opretter en kortlivet client secret via `POST /v1/realtime/client_secrets` med `OpenAI-Safety-Identifier` (hashet bruger-id).
3. Klienten opretter `RTCPeerConnection`, sender SDP-offer til `https://api.openai.com/v1/realtime/calls` med `Bearer ek_…`.
4. Server-events på datakanalen driver den delte voice-state-machine (`disconnected → connecting → listening → user-speaking → thinking → assistant-speaking …`) med begrænsede reconnects.
5. Færdige transskriptioner gemmes via `/api/realtime/transcripts` (respekterer brugerens privatlivsindstilling); samtalen skifter mode til `mixed`.
6. Ved afslutning stoppes mikrofonspor, datakanal og peer connection lukkes.

## Hukommelse

- **Korttid**: seneste beskeder + rullende resumé pr. samtale (opdateres hver 8. besked).
- **Langtid**: `memories`-tabellen med embedding (1536 dim), kategori, importance/confidence.
- Udtræk: efter hver tur analyserer modellen udvekslingen (styret af `MEMORY_EXTRACTION`-instruktionen). Følsomme og lav-konfidens-kandidater filtreres server-side, uanset hvad modellen svarer.
- Dedup: kandidater med cosine-similaritet ≥ 0,85 mod en eksisterende memory opdaterer den i stedet for at oprette en ny.
- Retrieval: pgvector-similaritet → kombineret score (similaritet 65 % + importance 25 % + recency 10 %), maks. 8 memories i prompten.
- Brugeren kan slå automatisk memory fra, redigere, slette og "glemme alt".

## Udskiftelighed

`AIProvider`-interfacet (`packages/ai/src/provider/types.ts`) er det eneste, resten af systemet kender til. `MOCK_AI=1` vælger den deterministiske mock (bruges af alle tests); en anden vendor kan tilføjes ved at implementere interfacet.

## Observability

- Strukturerede JSON-logs med request-id; nøgler/tokens redigeres automatisk.
- `usage_events` gemmer model, tokens, tid-til-første-token, varighed og stop-flag pr. tur – aldrig promptindhold.
- `GET /api/health` til liveness.
- React error boundary omkring app-indholdet.
