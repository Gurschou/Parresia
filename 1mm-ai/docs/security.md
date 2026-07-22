# Sikkerhed

## Nøglehåndtering

- `OPENAI_API_KEY` læses kun i `packages/ai` på serveren. Ingen klientkode importerer den, og den har ikke noget public prefix.
- Webklienten får udelukkende **kortlivede Realtime client secrets** (`ek_…`, TTL 10 min) fra `POST /api/realtime/session`. Endpointet kræver en gyldig session og er rate-limitet (10/min pr. bruger).
- `OpenAI-Safety-Identifier` sættes til et SHA-256-hash af bruger-id'et – aldrig rå id eller e-mail.
- Loggeren redigerer automatisk felter, hvis navne matcher `key|token|secret|password|authorization|credential`.

## Autentifikation og autorisation

- E-mail/adgangskode med bcrypt (cost 12). Login-fejl er ens for ukendt e-mail og forkert adgangskode (ingen user enumeration).
- Sessions er HS256-JWT'er signeret med `AUTH_SECRET`; web bruger httpOnly/`SameSite=Lax`-cookie, mobil bruger Bearer-header med token i SecureStore.
- Alle private ruter går gennem `requireUser()`; alle queries filtrerer på den autentificerede brugers id. Fremmede ressourcer svarer 404 (ikke 403) for ikke at afsløre eksistens.
- Kontosletning fjerner alle relaterede rækker via cascading foreign keys (verificeret i tests).

## Input og misbrug

- Alt klientinput valideres med Zod ved API-grænsen (`parseBody`).
- Beskeder maks. 8.000 tegn, memories maks. 1.000 tegn, titler maks. 120 tegn.
- Rate limits pr. bruger/IP: auth 10/min, chat 30/min, realtime-token 10/min, øvrige 120/min (in-memory; udskift med Redis ved flere instanser).
- Idempotency-nøgle + unik DB-constraint forhindrer dubletter fra dobbeltklik/retries.

## Prompt injection og tools

- Systeminstruktionen ligger på serveren og instruerer modellen i at behandle beskedindhold som data, ikke instruktioner.
- Tool-laget er en **allowlist**: modellen (og dermed klienten) kan kun udløse registrerede tools. Ukendte navne afvises uden eksekvering.
- Tool-argumenter valideres med Zod; bruger-id kommer altid fra sessionen, aldrig fra modellen/argumenterne, så et tool kan kun tilgå den aktuelle brugers data.
- Tool-fejl logges uden følsomt indhold og returneres som generiske beskeder til modellen.

## Privatliv

- Rå lyd gemmes aldrig. Transskriptioner gemmes kun når `saveVoiceTranscripts`-præferencen er slået til (standard: til, kan slås fra i indstillinger).
- Memory-udtræk filtrerer følsomme kategorier (helbred, religion, økonomi m.m.) server-side, uanset modellens output.
- Fuld dataeksport (`GET /api/account/export`) og fuld sletning (`DELETE /api/account`).
- Produktionslogs indeholder metadata (ids, varigheder, tokental) – aldrig promptindhold som standard.

## Kendte MVP-begrænsninger

- Rate limiter og stop-registry er in-memory og forudsætter én serverinstans. Ved horisontal skalering: flyt begge til Redis.
- Ingen e-mailverifikation eller password-reset endnu.
- CSRF: mutationer accepterer JSON med `SameSite=Lax`-cookie; overvej double-submit-token, hvis cookie-baserede cross-site-flows tilføjes.
