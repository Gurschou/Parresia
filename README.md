# SYNAPSE

An intelligence layer for mental, emotional and decision performance — built on top of foundation models (Claude, GPT, Gemini, Mistral, open source), not a chatbot.

SYNAPSE's core principle: **information does not create transformation**. Transformation happens through a loop the whole system is built around:

```
Pattern Detection → Pattern Understanding → Pattern Shift
        → Pattern-Aligned Action → Reflection → Growth
```

## What exists today (Phase 1)

| Layer | Package | Status |
| --- | --- | --- |
| Domain kernel (Result, errors, event bus, domain model) | `packages/shared` | ✅ |
| Model Router + provider adapters (Claude, GPT, Gemini, Mistral, OSS, mock) | `packages/ai` | ✅ |
| Memory Engine (layered memory, hybrid recall, session extraction) | `packages/memory` | ✅ |
| Intelligence engines (emotional, pattern, decision, coach, reflection, growth) | `packages/intelligence` | ✅ |
| Multi-agent system (router, coach, decision agents + orchestrator) | `packages/agents` | ✅ |
| Web app (chat + dashboard, dark minimal UI, API routes) | `apps/web` | ✅ |

The previous Python prototype is preserved unchanged under `legacy/awakenx-prototype/`.

## Quick start

```bash
pnpm install

# Optional — without keys SYNAPSE runs in offline mock mode:
cp apps/web/.env.example apps/web/.env.local   # add at least one API key

pnpm dev            # http://localhost:3000
```

Want to see the full experience without API keys? Run demo mode — scripted, realistic engine output through the real orchestration pipeline:

```bash
SYNAPSE_DEMO=1 pnpm dev
```

## Commands

```bash
pnpm test           # all unit + integration tests (vitest)
pnpm typecheck      # strict TypeScript across all packages
pnpm build          # production build
```

## Architecture at a glance

```
apps/web (Next.js)  ──►  SynapseOrchestrator (packages/agents)
                              │
              ┌───────────────┼───────────────────┐
              ▼               ▼                   ▼
        Router Agent    Intelligence Engines   Memory Engine
              │         (emotional, pattern,   (layered, hybrid
              ▼          decision, coach,       recall)
        Specialist       reflection, growth)
        agents                 │
              └───────► Model Router ◄──────────┘
                    (task-based provider selection
                     with automatic fallback)
```

Everything communicates through the typed in-process event bus (`packages/shared/src/events.ts`), which can later be swapped for a distributed broker without changing publishers or subscribers.

Full documentation lives in [`docs/`](docs/):

- [Architecture.md](docs/Architecture.md) — layers, principles, decisions
- [API.md](docs/API.md) — HTTP API reference
- [Memory.md](docs/Memory.md) — memory layers and recall ranking
- [Agents.md](docs/Agents.md) — the multi-agent system
- [Development.md](docs/Development.md) — working on the codebase
- [Roadmap.md](docs/Roadmap.md) — planned phases
