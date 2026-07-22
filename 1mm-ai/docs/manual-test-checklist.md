# Manuel testcheckliste – voice, mikrofon og lyd

Automatiske tests dækker ikke rigtig mikrofon, WebRTC og lydafspilning. Kør denne checkliste manuelt i en browser (Chrome anbefales først) med en rigtig `OPENAI_API_KEY` (uden `MOCK_AI`).

## Forudsætninger

- [ ] `apps/web/.env.local` har `OPENAI_API_KEY` og `OPENAI_REALTIME_MODEL` sat, `MOCK_AI` er tom.
- [ ] PostgreSQL kører, migrations er kørt, appen kører (`pnpm --filter @1mm/web dev`).
- [ ] Der er oprettet en testbruger.

## Mikrofon og tilladelser

- [ ] Klik på mikrofonknappen → browseren beder om mikrofontilladelse.
- [ ] Afvis tilladelsen → tydelig dansk fejlbesked, ingen crash, status "Der opstod en fejl".
- [ ] Giv tilladelsen → status går til "Forbinder…" og derefter "Lytter".
- [ ] Mens samtalen kører: browserens mikrofon-indikator er tændt.
- [ ] Afslut samtalen → mikrofon-indikatoren slukker (sporet er stoppet, ikke bare muted).

## Samtaleflow

- [ ] Sig noget → status skifter til "Du taler", derefter "Tænker…" og "1MM AI taler".
- [ ] AI-svaret afspilles som lyd, og der er kun ét lydspor (ingen ekko/dobbelt afspilning).
- [ ] Live transskription vises for både dig og AI'en, mens der tales.
- [ ] Færdige transskriptioner lander som beskeder i chatten og er der stadig efter genindlæsning.
- [ ] Skriv en tekstbesked i composeren midt i voice-samtalen → AI'en reagerer i samme session.

## Interruption

- [ ] Tal, mens AI'en taler → afspilningen stopper hurtigt (< ~0,5 s) og status bliver "Du taler".
- [ ] Klik på "Afbryd"-knappen, mens AI'en taler → afspilningen stopper med det samme.
- [ ] AI'en fortsætter ikke med at tale efter en afbrydelse (ingen "spøgelseslyd").

## Mute og push-to-talk

- [ ] Mute → AI'en reagerer ikke på tale; status viser "Mikrofon slukket".
- [ ] Unmute → samtalen fortsætter normalt.
- [ ] Slå push-to-talk til → mikrofonen er lukket, indtil knappen holdes nede.
- [ ] Hold-og-tal virker med både mus og touch; slip stopper input.

## Forbindelse og oprydning

- [ ] Slå netværket fra midt i en samtale → status "Genopretter forbindelsen…", derefter enten genoprettet eller en klar fejl. Ingen uendelig reconnect-løkke (maks. 3 forsøg).
- [ ] Naviger til en anden side midt i en samtale → mikrofonen slukker, ingen fortsat lyd.
- [ ] Start og afslut en samtale 3 gange i træk → ingen ophobning af lyd-elementer eller fejl i konsollen.
- [ ] Genindlæs siden midt i en samtale → ingen hængende mikrofon; ny samtale kan startes.

## Privatliv

- [ ] Slå "Gem transskriptioner" fra i indstillinger → nye voice-ture gemmes ikke i historikken.
- [ ] Tjek serverlogs: ingen API-nøgler, tokens eller transskriptionsindhold i logglinjerne.

## Mobil (Expo Go)

- [ ] Login, samtaleliste, ny chat, streaming, historik, hukommelse og indstillinger virker mod samme backend.
- [ ] Mikrofonknappen viser den dokumenterede besked om, at voice kræver en kommende opdatering.
