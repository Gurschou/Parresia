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

Ét system med otte dele:

| | |
|---|---|
| 1. **Webapp** | Indsæt eller upload et transskript, og få en struktureret rapport med citater som belæg |
| 2. **Lyd/video-pipeline** | ffmpeg → Whisper, AssemblyAI eller lokal whisper.cpp → samme analyse |
| 3. **Platform** | Eksperter og projekter, historik, sammenligning af 2-4 analyser og mønsterbibliotek på tværs af eksperter |
| 4. **Rapporter** | PDF og Markdown med alle sektioner og ordrette citater, plus JSON |
| 5. **CLI** | `modeling-cli analyze transcript.txt` / `audio.mp3` / `video.mp4` |
| 6. **Dashboard** | Meta-programmer, VAKOG, værdier, behov og overbevisninger over tid og på tværs af eksperter |
| 7. **Overbevisnings-match** | Hver ny analyse matches automatisk mod alle andre personer, begge veje: hvilke overbevisninger der passer til dig, og hvilke af dine der passer til andre |
| 8. **Modelleringskort** | Gustavs modellering: hver person modelleres ud fra alle sine samtaler (overbevisninger, mental syntaks, fysiologi, behov, regler, referenceoplevelser, millimeteren og en RPM-installationsplan), og hvert citat slås op ordret i transskripterne |

![Rapport](docs/screenshots/report.jpg)

![Modelleringskort](docs/screenshots/modeling.jpg)

![Overbevisnings-match](docs/screenshots/beliefs.jpg)

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
pnpm db:seed                             # valgfrit: demokonto med 3 eksperter, din egen profil, 5 analyser, match og modelleringskort
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

### Overbevisnings-match

Hver gang en analyse er færdig, sammenligner platformen personens overbevisninger med alle andre personer i biblioteket. Kommer der fx et transskript med Tony Robbins ind, finder den både hvilke af hans overbevisninger der passer til dig, og hvilke af dine der passer til ham.

- **Tre slags match:**
  - **Modvægt:** en styrkende overbevisning, der kan løsne en af modtagerens begrænsende.
  - **Passer til:** en styrkende overbevisning, der passer til modtagerens værdier, dominerende behov eller mål.
  - **Fælles:** begge har allerede en beslægtet overbevisning; fælles begrænsninger markeres med rødt.
- **Hvert match har:** pasform 0-100, ordret citat fra afsenderen, en begrundelse, der henviser til modtagerens egne fund, og ét spørgsmål, man kan prøve overbevisningen på med.
- **"Det er mig":** markér din egen ekspertprofil, så vises matchet som "passer til dig" på forsiden, i rapporterne og på siden *Overbevisnings-match*.
- **Samme regler som analysen:**
  - Kaldet bruger den uændrede `SYSTEM_PROMPT`. Opgaven og et inventar af de allerede udtrukne fund med id'er ligger i brugerbeskeden.
  - Svaret er structured output og valideres lokalt.
  - Id'erne slås op i de gemte analyser, så udsagn og citater aldrig kommer fra modellens hukommelse.
  - Begrænsende overbevisninger gives aldrig videre som noget, der "passer".
- **Robusthed:**
  - Kan Claude ikke svare, bruges en tekstbaseret match (`heuristicMatches`), og det står i rapporten.
  - Matchet kører i baggrunden, én bruger ad gangen, og afbrudte kørsler genoptages ved genstart.
  - Ældre analyser kan matches med ét klik.

### Modelleringskort (Gustavs modellering)

Når en analyse er færdig, modelleres personen igen ud fra **alle** personens samtaler (den nye først, de øvrige nyeste først). Metoden er Gustavs: modelleringskortet, dybdeprofilen og strategi-udledningen samlet i ét kort.

- **Kortets lag:**
  - **Kernen:** én sætning om, hvad personen er bygget op omkring.
  - **De tre døre:**
    - **Overbevisninger** i første person, med niveau (identitet, evne …) og "siger og gør"-tjek.
    - **Mental syntaks** trin for trin, med V/A/K/Ad-kanal, submodaliteter med personens egne ord og TOTE.
    - **Fysiologi** med opskriften på top og fald.
  - **Sprogmønstre** ordret.
  - **De to dominerende behov.**
  - **Regler og standarder.**
  - **Referenceoplevelser:** formativ, kapacitet, fare og den manglende reference.
  - **Sådan lander det hos personen:** chunk size, retning og convincer.
  - **Det, du ikke skal kopiere.**
  - **Spændingen og millimeteren.**
  - **Installationsplan (RPM):** resultat, formål, højst tre handlinger, ét fokus og mestringstempo.
  - **Blinde vinkler.**
- **Præcision håndhæves lokalt** (`verifyModelingMap`), ikke kun i prompten:
  - **Citater:** hvert citat slås op ordret i personens egne replikker. Citater, der ikke står der, eller som intervieweren sagde, fjernes.
  - **Konfidens:** fund uden verificeret belæg sættes ned til lav sikkerhed (Gustavs konfidensregel: høj = direkte citat eller gentaget mønster).
  - **Fysiologi:** fysiologi uden belæg fjernes, da kropssprog aldrig udledes af tekst.
  - **Submodaliteter:** submodaliteter, der ikke er personens egne ord, fjernes.
  - **Tomme felter:** opskrifter og den formative reference uden belæg tømmes og bliver til spørgsmål under blinde vinkler.
  - **Præcisionsgrad:** hvert kort viser, hvor stor en andel af fundene der står på ordrette citater, og hvilke samtaler mønstrene går igen i.
- **Installationsplanen:**
  - **"Det er mig":** er du markeret, skrives kortet til dig.
  - **Rollemodel:** modellerer du en anden, skrives planen til dig, og dine egne begrænsende overbevisninger bruges som forventet modstand.
- **Samme regler som analysen:** uændret `SYSTEM_PROMPT`, metoden og transskripterne i brugerbeskeden, structured output og lokal validering. Kan Claude ikke svare, bygges et tekstbaseret kort, og det står på kortet.
- **Hvor du ser det:**
  - siden *Modellering* (vælg person, se kortet over tid, download PDF/Markdown);
  - et felt i hver rapport;
  - knappen *Modelleringskort* på ekspertprofilen;
  - `modeling-cli model`.

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
modeling-cli match <mig.analysis.json> <andre.analysis.json…> [--mock] [--offline] [--json]
                                         # overbevisninger, der passer begge veje
modeling-cli model <ny.txt> [ældre.txt…] --name <navn> [--goal] [--domain] [--self]
                   [--format md,pdf,json] [--out dir] [--mock] [--offline] [--json]
                                         # Gustavs modelleringskort over én person (alle samtaler)
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
| `GET/POST` | `/api/analyses/:id/matches` | Analysens overbevisnings-match (status og resultat) · kør det igen (**202**) |
| `GET` | `/api/beliefs?person=<nøgle>` | Alle match for én person (standard: dig selv) + overblik over alle personer |
| `POST` | `/api/beliefs/backfill` | Match færdige analyser, der endnu ikke er matchet (**202**) |
| `GET/POST` | `/api/analyses/:id/model` | Analysens modelleringskort (status og indhold) · modellér igen (**202**) |
| `GET` | `/api/analyses/:id/model/export?format=pdf\|md\|json` | Modelleringskortet som fil |
| `GET` | `/api/modeling?person=<nøgle>&analysis=<id>` | Personer og det aktuelle kort (standard: dig selv) + kortet over tid |
| `POST` | `/api/modeling/backfill` | Modellér hver person, der endnu ikke har et kort (**202**) |
| `PATCH` | `/api/experts/:id` `{ isSelf: true }` | Markér eksperten som dig selv (kun én ad gangen) |
| `GET` | `/api/compare?ids=a,b[,c,d]` | Side-om-side-sammenligning |
| `GET` | `/api/dashboard?projectId=&expertId=` | Aggregerede mønstre |
| `GET` | `/api/health` | Status (DB, provider, model) |

## Tests

```bash
pnpm test          # 128 Vitest-tests: core (schema, prompt, analyzer, SDK-request, rate limit, PDF,
                   # transskribering med ffmpeg, match, modelleringskort og citat-verifikation),
                   # web-endpoints (rigtige route-handlere + PGlite), CLI
pnpm e2e           # Playwright mod produktionsbuildet i mock-mode (11 scenarier)
pnpm typecheck
```

## Produktion

Platformen kører som en **langlivet Node-server**, fordi analyser og transskribering kører som baggrundsjobs. Serverless (fx Vercel Functions) passer ikke.

```bash
cp .env.example .env    # ANTHROPIC_API_KEY, AUTH_SECRET, transskriberings-nøgle
docker compose up --build
```

`Dockerfile` bygger web og CLI med ffmpeg. `docker-compose.yml` starter PostgreSQL og platformen. Migrationer kører ved opstart, og `/api/health` bruges som healthcheck. Uden Docker: `pnpm build && DATABASE_URL=postgres://… pnpm start`.

## Claude Artifact-udgave

`apps/artifact` er samme platform som én selvstændig side, der kører inde i claude.ai uden server, nøgler eller login:

- **Analyse** via artifact-runtimens `sample` på seerens egen Claude-konto (første gang spørger claude.ai om lov). Samme `SYSTEM_PROMPT`, brugerbesked, schema, oprydning (`coerceToSchema`), Zod-validering og reparationsrunde som web og CLI.
- **Rapport** med alle kategorier, gem fund i mønsterbiblioteket, download som PDF (React-PDF i browseren), Markdown og JSON via `downloads`.
- **Historik, eksperter, sammenligning, mønstre og dashboard** med samme `@bm/core`-indsigter. Fire eksempel-analyser er indbygget og markeret som eksempler.
- **Overbevisnings-match** efter hver ny analyse:
  - Med Claude, når analysen er lavet med Claude; ellers tekstbaseret.
  - Samme inventar, brugerbesked og lokale validering som web-appen.
  - "Det er mig" gemmes privat sammen med analyserne.
- **Modelleringskort** efter hver ny analyse, over alle personens samtaler:
  - Med Claude på det grundige niveau (`complex`), når analysen er lavet med Claude; ellers tekstbaseret.
  - Samme brugerbesked og lokale citat-verifikation som web-appen.
  - Siden *Modellering* og et felt i hver rapport; kortet kan hentes som PDF og Markdown.
- **Lagring** privat pr. bruger i artifactets database (`data/users/<id>/…`). Uden for claude.ai falder den tilbage til browserens lager.

```bash
pnpm artifact:build     # → apps/artifact/dist/parresia-modeling.html (én fil)
```

Byggeskriptet tjekker først eksempel-analyserne mod schemaet, kompilerer Tailwind og bundler med esbuild. React 18 hentes fra cdnjs. Den færdige fil udgives som artifact med capabilities `sample`, `db`, `user` og `downloads`.

**Forskelle fra web-appen:**

- **System-prompt:** artifact-runtimen lader ikke siden sætte en system-prompt. `SYSTEM_PROMPT` sendes derfor uændret som første blok i input (`<system_prompt>…</system_prompt>`), efterfulgt af den sædvanlige brugerbesked.
- **Structured outputs:** analysen kører altid i `prompt`-mode, samme tilbagefald som web-appen bruger. JSON-schemaet ligger i prompten, og svaret valideres lokalt.
- **Model:** modellen vælges med claude.ai's niveauer ("Grundig" = `complex`, "Hurtigere" = `default`).
- **PDF:** bruger de indbyggede PDF-skrifter (Helvetica/Times).
- **Input:** kun tekst. Lyd og video kræver web-appen eller CLI'en (ffmpeg og en transskriberings-provider).

## Ærlige begrænsninger

- **Eye accessing cues** kan ikke observeres i ren tekst. Analysen bruger dem kun, når transskriptet har nonverbale annoteringer (fx "[kigger op til venstre]"). Ellers markeres de som udledt eller ikke tilgængelige.
- **Mock-mode** er til udvikling, demo og tests. Det er ikke en rigtig analyse.
- **Docker-imaget** er ikke bygget i udviklingsmiljøet, fordi der ikke var nogen Docker-daemon. PostgreSQL-stien (postgres.js + migrationer + hele brugerflowet) er testet mod en Postgres-protokol-server.
