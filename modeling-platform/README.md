# Parresia Modeling Studio

**Advanced Behavioral Modeling** med Claude. Platformen tager et interview, en optagelse eller et transskript og laver en evidensbaseret model af, hvordan en ekspert tænker, beslutter og handler.

Analysen udtrækker:

- **kognitive strategier** (sekvenser og TOTE)
- **styrkende og begrænsende overbevisninger**
- **værdier og de 6 Human Needs**
- **meta-programmer**
- **meaning-makers**
- **VAKOG**
- **eye accessing cues**
- **mangler og de næste spørgsmål**

Ét system med seks dele:

| | |
|---|---|
| 1. **Webapp** | Indsæt eller upload et transskript, og få en struktureret rapport med citater som belæg |
| 2. **Lyd/video-pipeline** | ffmpeg → Whisper, AssemblyAI eller lokal whisper.cpp → samme analyse |
| 3. **Platform** | Eksperter og projekter, historik, sammenligning af 2-4 analyser og mønsterbibliotek på tværs af eksperter |
| 4. **Rapporter** | PDF og Markdown med alle sektioner og ordrette citater, plus JSON |
| 5. **CLI** | `modeling-cli analyze transcript.txt` / `audio.mp3` / `video.mp4` |
| 6. **Dashboard** | Meta-programmer, VAKOG, værdier, behov og overbevisninger over tid og på tværs af eksperter |

![Rapport](docs/screenshots/report.jpg)

<table><tr>
<td><img src="docs/screenshots/dashboard.jpg" alt="Dashboard"></td>
<td><img src="docs/screenshots/compare.jpg" alt="Sammenligning"></td>
</tr><tr>
<td><img src="docs/screenshots/patterns.jpg" alt="Mønsterbibliotek"></td>
<td><img src="docs/screenshots/report-dark.jpg" alt="Rapport i mørkt tema"></td>
</tr></table>

---

## Kom i gang lokalt

**Forudsætninger:** Node.js ≥ 20 (22 anbefales), pnpm 10 (`corepack enable`) og ffmpeg (kun til lyd/video).

```bash
cd modeling-platform
pnpm install
cp .env.example apps/web/.env.local     # udfyld ANTHROPIC_API_KEY (se nedenfor)
pnpm db:migrate                          # opretter databasen (PGlite, ingen installation)
pnpm db:seed                             # valgfrit: demokonto med 3 eksperter og 4 analyser
pnpm dev                                 # → http://localhost:3000
```

Opret en konto på `/register`, eller log ind med demokontoen `demo@parresia.dk` / `demo1234`.

**Prøv uden API-nøgle:** sæt `LLM_PROVIDER=mock` og `TRANSCRIPTION_PROVIDER=mock`. Så kører hele platformen med en deterministisk mock-analyse, der bygges ud fra det rigtige transskript. Rapporten markeres tydeligt som "mock".

### Database

| `DATABASE_URL` | Bruges til |
|---|---|
| *(tom)* | **PGlite**: Postgres i en lokal mappe (`~/.parresia-modeling/pglite`). Ingen installation. |
| `postgres://user:pass@host:5432/db` | **PostgreSQL** i produktion |
| `memory://` | In-memory PGlite (tests) |

Dev og prod bruger samme Drizzle-schema og samme SQL-migrationer (`apps/web/drizzle/`). Migrationer køres automatisk ved serverstart og med `pnpm db:migrate`.

> Lokale data ligger med vilje **uden for projektet**. PGlite skriver filer ved hver forespørgsel, og en datamappe inde i projektet får Next' dev-watcher til at genindlæse siden i en løkke. Flyt den med `DATA_DIR`.

## Miljøvariabler

Alle variabler er dokumenteret i [`.env.example`](.env.example). De vigtigste:

| Variabel | Default | Beskrivelse |
|---|---|---|
| `ANTHROPIC_API_KEY` | – | Nøgle til Claude (påkrævet med `LLM_PROVIDER=anthropic`) |
| `LLM_PROVIDER` | `anthropic` | `anthropic` eller `mock` |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Fx `claude-sonnet-5-5` for lavere pris |
| `ANTHROPIC_EFFORT` | `high` | `low` … `max` |
| `ANTHROPIC_FALLBACKS` | `default` | Server-side fallback-model, hvis Claude afviser (`off` slår fra) |
| `STRUCTURED_OUTPUT` | `schema` | `schema` (structured outputs) eller `prompt` |
| `LLM_MAX_CONCURRENCY` / `LLM_REQUESTS_PER_MINUTE` / `LLM_MAX_RETRIES` | `2` / `20` / `4` | Rate-limiting og retries mod Claude |
| `USER_ANALYSES_PER_HOUR` | `20` | Kvote pr. bruger i web-appen |
| `TRANSCRIPTION_PROVIDER` | `openai` | `openai`, `assemblyai`, `whisper-local` eller `mock` |
| `OPENAI_API_KEY` / `OPENAI_TRANSCRIPTION_MODEL` | – / `whisper-1` | Whisper API (filer deles automatisk under 25 MB) |
| `ASSEMBLYAI_API_KEY` | – | AssemblyAI med talergenkendelse ("Taler A/B") |
| `WHISPER_CPP_BIN` / `WHISPER_CPP_MODEL` | `whisper-cli` / `./models/ggml-base.bin` | Lokal whisper.cpp |
| `TRANSCRIPTION_LANGUAGE` | `da` | Sprog-hint (tom = auto) |
| `DATABASE_URL` | *(PGlite)* | Se ovenfor |
| `AUTH_SECRET` | *(dev-default)* | **Påkrævet i produktion**: `openssl rand -base64 32` |
| `DATA_DIR` | `~/.parresia-modeling` | Lokale data (PGlite + uploads) |
| `MAX_UPLOAD_MB` | `500` | Max størrelse på lyd/video-upload |
| `DEMO_LOGIN` | – | `1` viser en "Prøv demoen"-knap på login (demokontoen). Kun til demo og preview. |

## Sådan virker analysen

- **System-prompten bruges uændret i alle LLM-kald** (`packages/core/src/prompt/system-prompt.ts`, låst af en test med SHA-256). Kategori-instruktioner, evidensregler, kontekst og transskript ligger i brugerbeskeden.
- **Structured output:** JSON-schemaet bygges af Zod-schemaerne og sendes som `output_config.format`. Svaret valideres igen lokalt:
  - enum-casing rettes, og min/max håndhæves deterministisk
  - ved valideringsfejl kører én reparationsrunde
  - er schemaet for komplekst til structured outputs, falder analysen tilbage til schema-i-prompten
- **Claude Opus 5.5** med adaptive thinking, `effort: high`, streaming (lange transskripter) og server-side fallback ved afvisning.
- **Evidensdisciplin:**
  - ordrette citater
  - `evidence_type` (citat, adfærd eller inferens) og `confidence` på hvert fund
  - kropssprog og øjenbevægelser udledes aldrig af tekst alene
  - instruktioner inde i transskriptet behandles som data
- **Krydstjek:** et deterministisk dansk/engelsk VAKOG-leksikon tæller prædikater ved siden af modellens vurdering.

### Robusthed og rate-limiting

- **Klient-side `RateLimiter`:** højst N samtidige kald og M kald pr. minut, delt af alle jobs i processen.
- **`withRetry`:** eksponentiel backoff med jitter, der respekterer `retry-after`. Kun 429, 529, 5xx, netværksfejl og timeouts forsøges igen, også fejl midt i en stream.
- **Typed `AnalysisError`** med danske brugerbeskeder: manglende eller ugyldig nøgle, rate limit, overbelastning, afvisning, afkortet output, ugyldigt output, for langt input og transskriberingsfejl.
- **Kvote pr. bruger** (analyser pr. time) i databasen, så den gælder på tværs af genstarter.
- **Baggrundsjobs** skriver status og fremdrift løbende og genoptages ved genstart. Fejlede analyser kan køres igen.

### Tilføj en ny analysekategori

Én ny fil i `packages/core/src/categories/` plus én linje i `registry.ts`. Schema, prompt, rapport (MD, PDF og web), dashboard-tal og "mangler"-mål følger automatisk med. Se [`CLAUDE.md`](CLAUDE.md).

## CLI

```bash
# fra kildekoden
pnpm cli analyze examples/interview-mette.txt --expert "Mette Holm"

# eller byg og installér globalt
pnpm --filter @bm/cli build
cd packages/cli && npm link            # → modeling-cli
```

```text
modeling-cli analyze <fil> [--out dir] [--format json,md,pdf] [--expert navn] [--domain tekst]
                          [--goal tekst] [--interviewer navn] [--language da]
                          [--transcriber openai|assemblyai|whisper-local|mock] [--model id] [--mock] [--stdout]
modeling-cli transcribe <lyd/video>      # kun transskribering → .transcript.txt
modeling-cli report <x.analysis.json>    # (gen)skab Markdown/PDF fra en gemt analyse
modeling-cli validate <x.analysis.json>  # schema-validering, exit-kode 1 ved fejl
modeling-cli schema                      # udskriv JSON-schemaet
modeling-cli doctor                      # tjek nøgler, ffmpeg og providers
```

`analyze` accepterer `.txt .md .srt .vtt .json` og lyd/video (`.mp3 .wav .m4a .mp4 .mov .webm` m.fl.). Den skriver `<navn>.analysis.json`, `<navn>.report.md` og `<navn>.report.pdf` (ved lyd også `<navn>.transcript.txt`) og viser en farvet opsummering i terminalen. CLI og web kalder samme `analyzeTranscript()` og giver derfor identisk output.

## API

Alle endpoints kræver login (Auth.js-session). Fejl har formen `{ "error": { "code", "message", "details?" } }`.

| Metode | Endpoint | |
|---|---|---|
| `POST` | `/api/register` | Opret bruger `{ name, email, password }` |
| `POST` | `/api/uploads` | Rå fil-body + header `x-file-name` → `{ uploadId }` |
| `POST` | `/api/analyses` | `{ transcript \| uploadId, expertId?, projectId?, title?, sessionDate?, context? }` → **202** |
| `GET` | `/api/analyses` | Liste (`?expertId=&projectId=&status=`) |
| `GET/PATCH/DELETE` | `/api/analyses/:id` | Analyse med resultat og metadata |
| `GET` | `/api/analyses/:id/status` | Let polling af fremdrift |
| `GET` | `/api/analyses/:id/report?format=pdf\|md\|json` | Rapport-download |
| `POST` | `/api/analyses/:id/retry` | Kør en fejlet analyse igen |
| `GET/POST` | `/api/experts`, `/api/projects` | Eksperter ("model/ekspert") og projekter |
| `GET/POST` | `/api/patterns` · `POST/DELETE /api/patterns/:id/examples` | Mønsterbiblioteket |
| `GET` | `/api/patterns/suggestions` | Automatisk fundne fælles mønstre |
| `GET` | `/api/compare?ids=a,b[,c,d]` | Side-om-side-sammenligning |
| `GET` | `/api/dashboard?projectId=&expertId=` | Aggregerede mønstre |
| `GET` | `/api/health` | Status (DB, provider, model) |

## Tests

```bash
pnpm test          # 83 Vitest-tests: core (schema, prompt, analyzer, SDK-request, rate limit, PDF,
                   # transskribering med ffmpeg), web-endpoints (rigtige route-handlere + PGlite), CLI
pnpm e2e           # Playwright mod produktionsbuildet i mock-mode (9 scenarier)
pnpm typecheck
```

## Produktion

Platformen kører som en **langlivet Node-server**, fordi analyser og transskribering kører som baggrundsjobs. Serverless (fx Vercel Functions) passer ikke.

```bash
cp .env.example .env    # ANTHROPIC_API_KEY, AUTH_SECRET, transskriberings-nøgle
docker compose up --build
```

`Dockerfile` bygger web og CLI med ffmpeg. `docker-compose.yml` starter PostgreSQL og platformen. Migrationer kører ved opstart, og `/api/health` bruges som healthcheck. Uden Docker: `pnpm build && DATABASE_URL=postgres://… pnpm start`.

## Ærlige begrænsninger

- **Eye accessing cues** kan ikke observeres i ren tekst. Analysen bruger dem kun, når transskriptet har nonverbale annoteringer (fx "[kigger op til venstre]"). Ellers markeres de som udledt eller ikke tilgængelige.
- **Mock-mode** er til udvikling, demo og tests. Det er ikke en rigtig analyse.
- **Docker-imaget** er ikke bygget i udviklingsmiljøet, fordi der ikke var nogen Docker-daemon. PostgreSQL-stien (postgres.js + migrationer + hele brugerflowet) er testet mod en Postgres-protokol-server.
