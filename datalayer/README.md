# 1MM Digital Twin — datalag

Datalaget bag 1MM's precision intelligence-platform. Kerneprincippet er
**"1MM som 1MM"**: hver bruger behandles som et individ med egen model —
aldrig som et gennemsnit af et segment.

Domænemodellen hedder **Digital Twin** og består af fire data stores, alle i
én PostgreSQL 16-instans (EU-region):

| Store | Skema | Karakter |
|---|---|---|
| Profile Store | `schema/profile.ts` | Normaliseret, stærk konsistens, cascade-sletbar |
| Event Log | `schema/events.ts` | TimescaleDB-hypertable, append-only, høj frekvens |
| Pattern Graph | `schema/patterns.ts` | Relationelt + pgvector, afledt tilstand |
| Intervention Ledger | `schema/ledger.ts` | Append-only, write-once outcomes, auditerbar |

## Kom i gang

Kræver PostgreSQL 16 med `timescaledb` (i `shared_preload_libraries`) og
`pgvector`.

```bash
npm install
export DATABASE_URL="postgres://onemm:onemm@localhost:5432/onemm"
npm run migrate    # kører migrations/*.sql i rækkefølge
npm run seed       # 90 dages data for tre fiktive atleter, deterministisk
npm test           # integrationstests mod databasen
```

## Struktur

```
schema/        Drizzle-skema pr. store (TypeScript-typerne)
migrations/    Håndskrevet SQL — sandheden om databasen (extensions,
               hypertable, continuous aggregates, triggers)
src/db/        Pool + migration-runner
src/ingest/    Idempotent ingest-pipeline; Whoop-adapter bag SourceAdapter
src/twin/      getTwinSnapshot(userId, atTime) — samlet tilstand på et tidspunkt
src/loop/      Precision Loop (pre/under/post) + PatternService
src/privacy/   Samtykke, eksport, sletning, redaction
seeds/         Tre atleter, 90 dage, kørt gennem den RIGTIGE pipeline
test/          Integrationstests (vitest)
```

## Centrale arkitekturbeslutninger

### Én Postgres, udskiftelige stores

Alt kører på én instans — ingen Kafka, ClickHouse, Neo4j eller microservices.
Koblingsreglen, der holder Pattern Graph og Event Log udskiftelige senere:
stores refererer hinanden **kun via opake id'er** (`user_id`,
`event_id + recorded_at`, `pattern_id`), aldrig via foreign keys på tværs af
store-grænser. Den eneste undtagelse er Profile Storens *interne* cascades,
som er nødvendige for sletning i én transaktion.

### PII er strukturelt isoleret

Direkte identificerende data findes i præcis én tabel: `user_identity`.
Alt andet refererer til en opak uuid. Ovenpå ligger to lag mere:

1. **Strikse Zod-whitelists** ved ingest-grænsen: et event-payload kan ikke
   indeholde et `name`-felt, fordi intet skema deklarerer ét. Ukendte nøgler
   afvises — whitelist slår blacklist.
2. **Tekstuel redaction** (`src/privacy/redaction.ts`): fritekstfelter og alt
   der serialiseres mod logs eller model-API'er scrubbes for e-mail, CPR og
   telefonnumre. `redactForModel()` er den eneste sanktionerede
   serialisering mod en model.

### Event Log: idempotens, forsinkelse og korrektioner

- **Dedupe-nøgle** `(source, external_id, user_id, recorded_at)` +
  `ON CONFLICT DO NOTHING`: at genafspille en Whoop-backfill er gratis.
  (`user_id`/`recorded_at` indgår, fordi TimescaleDB kræver
  partitioneringskolonnerne i unikke indexes — harmløst for dedupe.)
- **`recorded_at` ≠ `ingested_at`**, altid. Twin-snapshottet filtrerer på
  `ingested_at` og svarer dermed på *"hvad vidste systemet på tidspunkt T"*
  — afgørende for ærlig rekonstruktion af, hvorfor en intervention blev
  udløst, når wearable-data ankommer forsinket.
- **Korrektioner er nye rækker**: Whoop-rescores får `external_id` med
  `:rev<epoch>`-suffiks og `supersedes_event_id`. Én bevidst undtagelse fra
  "ingen updates" (godkendt): den gamle række får `is_superseded=true`
  (write-once, trigger-håndhævet), så continuous aggregates kan ekskludere
  forældede rækker med et simpelt `WHERE`.
- **Append-only håndhæves af en DB-trigger**, ikke af konvention. Den eneste
  sanktionerede sletning er privacy-erasure-stien, som sætter en
  transaktionslokal GUC (`onemm.privacy_erasure`).

### Pattern Graph: konfidens er eksplicit, altid

Hvert pattern bærer `confidence` **og** `observation_count`, og status er
afledt af begge: `n < 5` kan aldrig forlade `hypothesis` (håndhævet både i
`PatternService` og af en CHECK-constraint). Systemet må aldrig præsentere
en n=2-korrelation som viden.

Pattern Graph er den eneste store med in-place updates — bevidst: patterns
er *afledt* tilstand og kan altid genberegnes fra `pattern_evidence` og
Event Loggen. Embeddings (`vector(1536)`, HNSW/cosine) bruges **kun** til
cold start-similaritet på tværs af brugere (kræver
`cold_start_similarity`-samtykke) og overskriver aldrig individets egen model.

### Intervention Ledger: auditerbarhed via trigger

Kravet er auditerbarhed, ikke kryptografisk immutability. En DB-trigger
håndhæver:

- `DELETE` afvises altid.
- Frosne kolonner (`trigger_context`, `hypothesis`, `content`,
  `outcome_window`, versioner) kan aldrig ændres.
- Outcome-kolonner (`delivery_*`, `adherence*`, `measured_effect`,
  `hypothesis_outcome`) er write-once: NULL → værdi, aldrig værdi → anden værdi.

`trigger_context` er et **snapshot** (jsonb), ikke referencer: profilen
ændrer sig, patterns' konfidens driver, events bliver superseded — men det,
der udløste *denne* intervention, ligger fast. `intervention_pattern` fryser
`(confidence, n)` pr. pattern på udstedelsestidspunktet.

De tre design-queries er trivielle:

```sql
-- 1. Hvilke interventionstyper virker for denne profil-signatur? (GIN-index)
SELECT intervention_type, hypothesis_outcome, count(*)
FROM intervention
WHERE trigger_context->'profile_signature' @> '{"volume_band":"8-12h"}'
GROUP BY 1, 2;

-- 2. Hypotese-hitrate pr. interventionstype (rene kolonner)
SELECT intervention_type, hypothesis_outcome, count(*)
FROM intervention GROUP BY 1, 2;

-- 3. Patterns bag konsistent fejlende interventioner (junction-join)
SELECT ip.pattern_id,
       count(*) FILTER (WHERE i.hypothesis_outcome = 'refuted') AS refuted,
       count(*) AS total
FROM intervention_pattern ip
JOIN intervention i USING (intervention_id)
GROUP BY 1;
```

### Precision Loop: service-lag, ingen egen persistens

`src/loop/` orkestrerer de fire stores og kører for **én bruger isoleret** —
ingen batch-logik på tværs af brugere:

1. **Pre-protokol** `issueIntervention()`: twin-snapshot → generator →
   ledger-insert med frosset `trigger_context`. Generatoren er pluggable
   (`InterventionGenerator`); den nuværende er regelbaseret
   (`src/loop/baseline.ts`), en model-backet erstatter den uden at røre stores.
2. **Under** `recordAdherence()`: rå protokol-events til Event Loggen
   (append-only kilde) + write-once adherence-dom på ledger-rækken.
3. **Post-protokol** `measureOutcomes()`: efter `outcome_window` beregnes
   `measured_effect` fra Event Loggen (med evidens-referencer), og dommen
   føres tilbage i Pattern Graph med justeret konfidens. Inconclusive
   outcomes flytter bevidst *ikke* konfidens.

### GDPR (art. 9-data)

- **Samtykke** pr. datakategori × formål, versioneret og tidsstemplet, i en
  append-only tabel (tilbagetrækning = ny række). Ingest afviser events uden
  samtykke for kategorien.
- **Eksport** (`exportUserData`): alt om én bruger som ét maskinlæsbart
  JSON-dokument, grupperet pr. store.
- **Sletning** (`eraseUser`, én transaktion): hard delete af Profile
  (cascade), Event Log og Pattern Graph. **Intervention Ledger anonymiseres
  i stedet for at slettes** — begrundelse dokumenteret i
  `src/privacy/deletion.ts`: ledgeren er systemets egen adfærdshistorik
  (art. 17(3)(d), recital 156), og efter nulstilling af `user_id` er rækken
  anonym information uden for GDPR's anvendelsesområde (recital 26), fordi
  `trigger_context` er PII-fri *by construction*. Kan vendes til hard delete
  med ét flag, hvis vurderingen ændres.

## Bevidst udskudt

- **Temporal versionering af Profile Store.** `getTwinSnapshot(userId, atTime)`
  er tidstro for Event Log (via `ingested_at`), thresholds og præferencer
  (nyeste række ≤ atTime), men baseline/samtykke returneres som nuværende
  tilstand. Fuld bitemporal historik tilføjes, når et konkret behov opstår.
- **Rigtig Whoop OAuth/HTTP-klient.** Adapteren er komplet
  (mapping, revisioner, webhook), transporten er et interface
  (`WhoopClient`); produktion mangler kun en HTTP-implementering + token-flow.
- **Embedding-generering.** `pattern_embedding` (skema + HNSW-index) er klar,
  men ingen kode kalder en embedding-model endnu — cold start er fase 2.
- **Model-backet interventionsgenerator.** Slottet findes
  (`InterventionGenerator`); den regelbaserede baseline demonstrerer loopet
  ærligt uden at foregive intelligens.
- **Tidszone-korrekte rollups.** Continuous aggregates bucketer i UTC;
  præcise lokal-døgn-queries går gennem `src/twin`, som kender brugerens
  tidszone. Per-bruger `time_bucket`-tidszoner tilføjes ved behov.
- **Job-scheduling.** `measureOutcomes` er en funktion, ikke en daemon.
  Cron/queue-infrastruktur vælges sammen med hosting.
- **Statistisk seriøs effektmåling.** `simpleEffectMeasurer` er pre/post-
  gennemsnit med ærlig "inconclusive" ved n < 2 — bevidst blunt, til den
  erstattes af en rigtig kausal metodik.
- **Auth.** `user_identity.auth_subject` er pladsen til en ekstern
  auth-provider; selve autentificeringen ligger uden for datalaget.

## Seeds

`npm run seed` nulstiller databasen (dev-only `TRUNCATE`) og genererer 90
dages deterministisk, fysiologisk plausibel data for tre atleter — Freja
(triatlet, DK), Mikkel (gravel, DK, kronisk kort søvn, lav adherence) og
Ingrid (trail-ultra, NO, tilbøjelig til overreaching) — inklusive rough
patches med lav recovery, daglige selvrapporter, interventioner udstedt og
målt af det rigtige loop samt én retroaktiv Whoop-korrektion pr. atlet.
Bemærk at én atlet (Mikkel) bevidst *ikke* har givet
`cold_start_similarity`-samtykke.
