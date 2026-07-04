# SynapseX — Atlet → Briefing → Coach

SynapseX is the bridge between an athlete and their performance coach. The athlete does not talk to the coach every day — but they can talk to SynapseX. It listens, asks the right questions, and converts the conversation into a briefing the coach reads in two minutes before the session.

SynapseX does not replace the coach. It gives the coach eyes that see the athlete when the coach is not in the room.

## One pipeline, two phases

```
Atlet ──(Fase A: intake-samtale)──► SynapseX ──(Fase B: briefing)──► Coach
```

| | Fase A (til atleten) | Fase B (til coachen) |
| --- | --- | --- |
| Tone | Ild og hjerte — varm lytter der bliver til direkte udfordrer | Direkte, analytisk, kort |
| Kompromis | Ingen undskyldninger, ingen "måske" | Ingen fortolkning ud over det observerede |
| Formål | Bryde mønstre, kræve beslutning og ejerskab | Give coachen retning på 2 minutter |
| Afslutning | Når atleten har klarhed eller en konkret beslutning | Én anbefalet retning — ikke tre muligheder |

## Implementation

| Component | Where | Role |
| --- | --- | --- |
| `IntakeEngine` | `packages/intelligence/src/intake.ts` | Fase A persona (system prompt v1.1). SynapseX opens the conversation itself and is transparent that it becomes a briefing. |
| `BriefingEngine` | `packages/intelligence/src/briefing.ts` | Fase B: transcript → validated `Briefing` (JSON mode, temperature 0.1). |
| `SynapseXPipeline` | `packages/agents/src/synapsex.ts` | Session management, briefing persistence, feeding previous core insights back into both phases. |
| Web | `/intake` and `/briefings` + `/api/synapsex/*` | Athlete chat and coach view. |

Model routing: intake uses the `intake` task (Claude-first, like coaching); briefing generation uses the `briefing` task (GPT-first, analytic). Both configurable in `defaultRoutingPolicy`.

## Briefing format

Readable (what the coach sees) and structured (what is stored) — both carry:

- **Kerneindsigt** — 1-2 sentences, the most important thing right now.
- **Fysisk tilstand** — only if relevant/deviating.
- **Mentalt fokus** — what occupies the athlete before the session.
- **Flags** — taxonomy: `need-shift`, `information-uden-transformation`, `retningsløs-stilhed`, `stagnation`, `falsk-resonans`, `emotionel-eskalering`, `akut`. Each with confidence (`lav`/`mellem`/`høj`) and evidence. High threshold: quiet by default.
- **Citat** — at least one verbatim quote so the coach has raw material, not just interpretation.
- **Anbefalet fokus** — exactly ONE direction.

## Safety

- Never diagnoses — names patterns, not conditions.
- Signs of acute distress: intake stops, the athlete is urged to talk to a human now, and the briefing carries an `akut` flag which is surfaced **first** (top-level `akut: boolean`, sorted first in `flags`, rendered as a banner in the coach view).
- SynapseX never replaces the coach's judgment — it delivers raw material and direction; the coach decides.

## v1 decisions (from the open questions)

1. **Ser atleten briefingen?** Athlete sees a confirmation that the briefing was sent; the full briefing lives in the coach view. (In the current single-user app both views are reachable; role-based access lands with auth in Phase 2.)
2. **Hyppighed** — one briefing per intake session; nothing stops multiple intakes per day.
3. **Flag-taxonomi** — EDO's six categories + `akut` retained as scaffolding; easy to replace (single const in `briefing.ts`).
4. **Data over tid** — yes: briefings persist per athlete, and the last 3 core insights are fed into both intake and briefing generation so recurring themes can be flagged ("tredje gang på to uger han nævner søvn").
5. **Teknisk lag** — chat (text) directly with the athlete in v1; the pipeline is UI-agnostic, so voice or another interface can drive the same `SynapseXPipeline`.
