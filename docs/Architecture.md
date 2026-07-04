# SYNAPSE — Architecture

## Vision

SYNAPSE is an intelligence layer on top of foundation models that helps people develop awareness, clarity, emotional intelligence and better decisions. It must feel like **one intelligence** regardless of which model serves a given request.

## Principles

- **Clean architecture / DDD**: the domain model (`packages/shared/src/domain`) has zero dependencies. Engines depend on ports (interfaces), never on concrete infrastructure.
- **Event-driven**: engines publish domain events (`pattern.detected`, `emotion.analyzed`, `decision.analyzed`, `memory.stored`, `reflection.completed`, `coach.commitment`) on a typed bus. Subscribers are decoupled from publishers; the in-process bus can be replaced by a distributed broker behind the same interface.
- **Results over exceptions**: fallible operations return `Result<T, E>` so failure handling is part of every signature.
- **Graceful degradation**: every model-dependent path has a fallback — providers fall through to the next preference, routing falls back to the coach, and a mock provider keeps the product usable with zero configuration.
- **No hardcoded intelligence**: routing policies, agent registries and memory stores are all injected configuration.

## Layers

### 1. Presentation — `apps/web`

Next.js App Router. Chat interface and growth dashboard, dark minimal design (Apple/Linear/Cursor-inspired). Mobile, voice and AR are future presentation surfaces that reuse the same HTTP API.

### 2. Intelligence Layer — `packages/intelligence`

The brain. Each engine is independently testable and model-agnostic:

| Engine | Responsibility |
| --- | --- |
| `EmotionalEngine` | Text → `EmotionalSnapshot` (valence, arousal, stress, energy, motivation, resistance, uncertainty, optimism, confusion, clarity) |
| `PatternEngine` | Detects patterns across 19 categories, always with a **why** (understanding) and a suggested shift; reinforces known patterns instead of duplicating |
| `DecisionEngine` | Full decision analysis: signal, patterns, root cause, human needs, trade-offs, blind spots, 1st/2nd/3rd-order consequences, risk/opportunity, recommended actions, confidence, alternative paths, reflection question |
| `CoachEngine` | The conversational coach: powerful questions, challenges assumptions, names patterns, drives toward action; injects memory/pattern/emotion context quietly |
| `ReflectionEngine` | End-of-session insight distillation, commitment capture, carry-forward question |
| `computeGrowthMetrics` | Deterministic (no model calls) metric computation for the dashboard |

### 3. Model Router — `packages/ai`

`ChatModel` is the single provider-agnostic contract. Adapters exist for Anthropic (Claude), OpenAI-compatible APIs (GPT, Mistral, vLLM/Ollama), Google (Gemini), and a deterministic mock. `ModelRouter` walks a per-task preference list (`RoutingPolicy`) and falls back automatically on unavailability or errors. The default policy:

| Task | Preference |
| --- | --- |
| creative-writing, coding, coaching, emotional/pattern analysis | Claude → GPT → … |
| reasoning, decision-analysis | GPT → Claude → … |
| translation | Gemini → GPT → … |
| fast, memory-extraction, summarization | Mistral → … |

Policies are plain data and replaceable at runtime (`router.setPolicy`).

### 4. Memory — `packages/memory`

See [Memory.md](Memory.md). Layered (session / short-term / long-term / identity / learning), retrieved by hybrid ranking (similarity + recency + importance + reinforcement), extracted automatically from finished sessions.

### 5. Agents — `packages/agents`

See [Agents.md](Agents.md). A Router Agent classifies each turn; specialist agents (coach, decision, and future psychology/leadership/learning/research/strategy/health agents) handle it. `SynapseOrchestrator` is the application service that composes everything.

## Persistence

Phase 1 uses file-backed adapters (`FileMemoryStore`, `FilePatternRepository`) behind the same ports a database adapter will implement (Postgres + pgvector planned — see [Roadmap.md](Roadmap.md)). Engines never know which store they run on.

## Security posture (Phase 1 → 2)

The web app currently runs single-user without auth. The architecture is prepared for it:

- All engine APIs are keyed by `userId` — multi-tenancy is a data question, not a code question.
- Errors carry stable codes for correct HTTP mapping.
- Secrets only enter via environment variables; nothing is persisted.

Phase 2 adds authentication, authorization, encryption at rest, audit logs and GDPR tooling (export + erasure) — the ports to implement them against already exist.

## Decisions & trade-offs

- **TypeScript monorepo (pnpm)** instead of the Python prototype: one language across engine, API and UI, strict typing at every boundary, trivial code sharing. The prototype is preserved under `legacy/`.
- **fetch-based provider adapters** instead of vendor SDKs: smaller dependency surface, uniform error handling, easy to add providers. SDKs can replace adapters behind `ChatModel` if streaming/tool-use requires it.
- **In-process event bus** first: correct contract now, distribution later.
- **Deterministic growth metrics**: dashboard numbers are explainable and unit-tested rather than model-generated.
