# Deploy

MVP'en er designet til en simpel opsætning, én udvikler kan drive: én Next.js-instans + én PostgreSQL.

## Web (Vercel eller enhver Node-host)

1. **Database**: Managed PostgreSQL med pgvector (fx Neon eller Supabase – begge har pgvector). Sæt `DATABASE_URL` (pooler) og `DIRECT_URL` (direkte, til migrations).
2. **Migrations**: kør `pnpm db:migrate` fra CI/lokalt mod `DIRECT_URL` før første deploy og efter skemaændringer.
3. **Miljøvariabler** (server-side i host-panelet): `DATABASE_URL`, `DIRECT_URL`, `OPENAI_API_KEY`, `OPENAI_TEXT_MODEL`, `OPENAI_REALTIME_MODEL`, `OPENAI_EMBEDDING_MODEL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`.
4. **Vercel**: sæt Root Directory til `apps/web`; monorepoet bygges automatisk med Turborepo. Alternativt enhver Node-host: `pnpm install && pnpm --filter @1mm/web build && pnpm --filter @1mm/web start`.
5. **Streaming**: chat-endpointet bruger SSE via en langvarig response. Sørg for at platformens funktion-timeout er ≥ 60 s (Vercel: Fluid Compute/`maxDuration`).

Bemærk ved flere instanser: rate limiter og stop-registry er in-memory. Flyt dem til Redis (fx Upstash), før der skaleres horisontalt.

## Mobil

- Development: `EXPO_PUBLIC_API_URL=https://din-app.example.com pnpm --filter @1mm/mobile dev`.
- Distribution: EAS Build (`npx eas build`) med `EXPO_PUBLIC_API_URL` sat i EAS-miljøet. Ingen hemmeligheder i appen – kun den offentlige API-URL.

## Drift

- Health check: `GET /api/health`.
- Logs er JSON-linjer på stdout – peg din log-pipeline på dem.
- Usage/omkostninger: `usage_events`-tabellen indeholder model + tokental pr. tur.
- Backup: standard PostgreSQL-backup dækker alt (alle brugerdata ligger i databasen).
