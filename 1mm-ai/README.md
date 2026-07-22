# 1MM AI

Personlig AI-assistent med live tekstchat, real-time stemmesamtaler, samtalehistorik og langsigtet hukommelse. Bygget som TypeScript-monorepo til web (Next.js) og mobil (Expo/React Native).

## Indhold

- [Funktioner](#funktioner)
- [Arkitektur](#arkitektur)
- [Kom i gang](#kom-i-gang)
- [Miljøvariabler](#miljøvariabler)
- [Kommandoer](#kommandoer)
- [Tests](#tests)
- [Mobilappen](#mobilappen)
- [Sikkerhed](#sikkerhed)
- [Videre dokumentation](#videre-dokumentation)

## Funktioner

- Konto med e-mail/adgangskode (JWT-sessions: httpOnly-cookie på web, Bearer-token på mobil).
- Tekstchat med ord-for-ord streaming (OpenAI Responses API), stop, prøv igen og idempotente sends.
- Live stemmesamtale på web (OpenAI Realtime API via WebRTC) med voice activity detection, afbrydelse, mute, push-to-talk og live transskription.
- Samtalehistorik med automatisk titel, arkivering og sletning.
- Langtidshukommelse med pgvector: automatisk udtræk, semantisk deduplikering, redigering, sletning og "glem alt".
- Sikkert værktøjslag med allowlist (demo: `get_current_user_profile`).
- Dataeksport og fuld kontosletning (GDPR).
- Mock AI-provider (`MOCK_AI=1`) så hele appen kan køres og testes uden OpenAI-nøgle.

## Arkitektur

```
1mm-ai/
  apps/
    web/        Next.js (App Router): UI + alle API-ruter
    mobile/     Expo/React Native: iOS + Android (deler API og typer)
  packages/
    ai/         OpenAI-integration, prompts, memory-logik, tool-registry
    database/   Drizzle-skema, migrations, pgvector, klient
    shared/     Typer, Zod-skemaer, voice-state-machine, SSE-parser
    ui/         Delte design-tokens (web + mobil)
    config/     Fælles TypeScript-konfiguration
  docs/         Arkitektur, sikkerhed, mobil voice, testcheckliste, deploy
```

Se [docs/architecture.md](docs/architecture.md) for detaljer.

## Kom i gang

Krav: Node.js >= 20, [pnpm](https://pnpm.io) >= 10, Docker (til PostgreSQL) **eller** en lokal PostgreSQL med pgvector.

```bash
# 1. Installér dependencies
pnpm install

# 2. Start PostgreSQL med pgvector
docker compose up -d db

# 3. Opret miljøfiler
cp .env.example apps/web/.env.local
# Åbn apps/web/.env.local og udfyld:
#   AUTH_SECRET  (generér med: openssl rand -base64 32)
#   OPENAI_API_KEY  (eller sæt MOCK_AI=1 for at køre uden nøgle)

# 4. Kør migrations
pnpm db:migrate

# 5. Start webappen
pnpm --filter @1mm/web dev
# → http://localhost:3000
```

Uden Docker: installér PostgreSQL 16+ og pgvector-extensionen, opret databasen `onemm_ai`, og peg `DATABASE_URL` på den. Migrationerne kører `CREATE EXTENSION IF NOT EXISTS vector` automatisk.

Vil du prøve appen uden OpenAI-nøgle, så sæt `MOCK_AI=1` i `apps/web/.env.local` – chatten svarer så med en deterministisk mock (bruges også af alle automatiske tests).

## Miljøvariabler

Se [.env.example](.env.example). De vigtigste:

| Variabel | Beskrivelse | Server-only |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL-forbindelse (pgvector kræves) | Ja |
| `DIRECT_URL` | Direkte forbindelse til migrations (ved pooler) | Ja |
| `OPENAI_API_KEY` | OpenAI-nøgle. **Sendes aldrig til klienten.** | Ja |
| `OPENAI_TEXT_MODEL` | Tekstmodel (fx `gpt-4.1-mini`) | Ja |
| `OPENAI_REALTIME_MODEL` | Realtime-model (fx `gpt-realtime`) | Ja |
| `OPENAI_EMBEDDING_MODEL` | Embedding-model (fx `text-embedding-3-small`) | Ja |
| `AUTH_SECRET` | Signerer session-tokens (min. 16 tegn) | Ja |
| `NEXT_PUBLIC_APP_URL` | Webappens offentlige URL | Nej |
| `EXPO_PUBLIC_API_URL` | API-base-URL til mobilappen | Nej |
| `MOCK_AI` | `1` = deterministisk mock-provider uden netværkskald | Ja |
| `SUPABASE_*` | Valgfrit: alternativ auth-provider (ikke krævet) | Ja |

Kun variabler med `NEXT_PUBLIC_`/`EXPO_PUBLIC_`-prefix når klienten.

## Kommandoer

Fra roden af `1mm-ai/`:

| Kommando | Effekt |
| --- | --- |
| `pnpm dev` | Start alle dev-servere (turbo) |
| `pnpm --filter @1mm/web dev` | Start kun webappen |
| `pnpm --filter @1mm/mobile dev` | Start Expo (mobil) |
| `pnpm build` | Byg alle pakker |
| `pnpm typecheck` | TypeScript-tjek i alle pakker |
| `pnpm lint` | ESLint |
| `pnpm test` | Alle unit- og integrationstests (Vitest) |
| `pnpm test:e2e` | Playwright end-to-end (kræver kørende PostgreSQL) |
| `pnpm db:generate` | Generér ny migration efter skemaændring |
| `pnpm db:migrate` | Kør migrations |

## Tests

- **Unit** (`packages/shared`, `packages/ai`): Zod-validering, voice-state-machine, SSE-parsing, memory-ranking/-deduplikering, promptbygning, tool-allowlist.
- **Integration** (`packages/database`, `apps/web/test`): kører mod en in-process PostgreSQL (PGlite) med pgvector og de rigtige migrations – ingen Docker nødvendig. Dækker auth, chat-streaming, idempotens, brugerisolation, Realtime-token (med/uden login), memories og kontosletning.
- **E2E** (`apps/web/e2e`): Playwright mod et produktionsbuild med mock-AI: registrér → chat → streamet svar → genindlæs → historik → slet.

OpenAI mockes i alle automatiske tests – der testes aldrig mod den rigtige API.

```bash
pnpm test                      # unit + integration
pnpm --filter @1mm/web test:e2e  # e2e (kræver Postgres kørende + build)
```

Manuel testcheckliste for mikrofon/WebRTC/interruption: [docs/manual-test-checklist.md](docs/manual-test-checklist.md).

## Mobilappen

```bash
# Backend skal køre først (pnpm --filter @1mm/web dev)
cd apps/mobile
EXPO_PUBLIC_API_URL=http://<din-maskines-ip>:3000 pnpm dev
# Scan QR-koden med Expo Go (iOS/Android)
```

Bemærk: på en fysisk enhed skal `EXPO_PUBLIC_API_URL` pege på din maskines LAN-IP, ikke `localhost`.

Fase A (tekstchat, historik, hukommelse, konto) er fuldt fungerende. Live voice på mobil er isoleret bag `VoiceTransport`-interfacet og en feature flag – se [docs/mobile-voice.md](docs/mobile-voice.md) for den ærlige status og planen (native WebRTC via development build eller server-side WebSocket-bridge).

## Sikkerhed

- `OPENAI_API_KEY` bruges kun på serveren. Klienter får kun kortlivede Realtime client secrets (`ek_…`) fra `/api/realtime/session`, som kræver login og er rate-limitet.
- Alle private ruter verificerer sessionen, og alle queries filtrerer på den autentificerede brugers id.
- Alt input valideres med Zod; beskeder og memories har længdegrænser.
- Tools kører kun server-side fra en allowlist med Zod-validerede argumenter.
- Rå lyd gemmes aldrig; transskriptioner gemmes kun når brugerens indstilling tillader det.
- Struktureret logging uden nøgler, tokens eller prompt-indhold.

Detaljer: [docs/security.md](docs/security.md).

## Videre dokumentation

- [docs/architecture.md](docs/architecture.md) – arkitektur og dataflow
- [docs/security.md](docs/security.md) – trusselsmodel og tiltag
- [docs/mobile-voice.md](docs/mobile-voice.md) – status og plan for mobil voice
- [docs/manual-test-checklist.md](docs/manual-test-checklist.md) – manuel voice-test
- [docs/deployment.md](docs/deployment.md) – deploy-vejledning
