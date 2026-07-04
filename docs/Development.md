# SYNAPSE — Development Guide

## Prerequisites

- Node.js ≥ 22
- pnpm ≥ 10

## Setup

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # optional; add provider keys
pnpm dev                                        # http://localhost:3000
```

With no API keys, SYNAPSE runs fully offline against the deterministic mock provider — every flow (chat, routing, patterns, reflection, dashboard) works, with placeholder content.

## Repository layout

```
apps/
  web/                 Next.js app: UI + API routes + composition root
packages/
  shared/              Domain kernel: Result, errors, event bus, domain types
  ai/                  Model Router, provider adapters, JSON parsing
  memory/              Memory engine, stores, hybrid recall
  intelligence/        Emotional, pattern, decision, coach, reflection, growth
  agents/              Agents + orchestrator (application service)
docs/                  Architecture and reference documentation
legacy/                Preserved Python prototype (read-only)
```

Dependency direction (never violated):

```
shared ← ai ← memory ← intelligence ← agents ← apps/web
```

## Commands

| Command | What |
| --- | --- |
| `pnpm test` | All tests (vitest) across packages |
| `pnpm typecheck` | Strict TypeScript everywhere |
| `pnpm build` | Production build (all packages + web) |
| `pnpm --filter @synapse/memory test` | Single package |

## Conventions

- Strict TS: `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`.
- Fallible operations return `Result<T, E>`; exceptions are for programmer errors.
- Every engine takes its dependencies via constructor (ports, router, event bus) — no globals, no singletons outside the web composition root.
- Model output is never trusted: JSON is parsed defensively (`parseModelJson`) and validated/clamped field by field.
- Tests use the `MockModel` with scripted per-task responses; no test touches the network.
- Domain events over direct calls when an engine's output is another engine's input.

## Testing strategy

| Level | Where | Examples |
| --- | --- | --- |
| Unit | each package's `test/` | recall ranking, growth metrics, router fallback |
| Integration | `packages/agents/test` | full turns through the orchestrator with scripted models |
| E2E (manual for now) | `apps/web` | build + API smoke test (`/api/chat`, `/api/metrics`) |

AI evaluation tests (grading real model output quality) are planned once provider keys exist in CI — see Roadmap.
