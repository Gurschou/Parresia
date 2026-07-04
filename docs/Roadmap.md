# SYNAPSE — Roadmap

Phase 1 (this repository state) delivers the foundation: domain kernel, model router, memory engine, intelligence engines, multi-agent orchestration and the web experience.

## Phase 2 — Persistence & Identity

- Postgres adapter for `MemoryStore` and `PatternRepository` (+ pgvector embeddings for true semantic recall).
- Real embedding pipeline (embedding task type on the Model Router).
- Authentication + authorization (multi-user), session persistence across restarts.
- Audit log of all model calls (provider, tokens, purpose) — GDPR groundwork, data export and erasure.

## Phase 3 — Deeper intelligence

- Identity Engine: maintain `IdentityProfile`, measure identity alignment from behaviour, value/goal-conflict detection.
- Planning Engine + Recommendation Engine (goals → plans → daily recommendations).
- Learning Engine: per-user adaptation of coaching style from feedback signals.
- Pattern lifecycle automation: advance `stage` (detected → understood → … → integrated) from conversation evidence.
- Specialist agents: psychology, leadership, learning, research, strategy, health.
- AI evaluation harness: scripted rubrics grading coach/decision quality per model, wired into CI.

## Phase 4 — Surfaces & tools

- Streaming responses; voice interface (STT/TTS).
- Mobile app (React Native/Expo) reusing the HTTP API.
- Tool layer: calendar, email, notes, documents, browser/search, PDF, vision, wearables — as capabilities agents can invoke.
- Knowledge architecture: knowledge graph + hybrid search over user documents.

## Phase 5 — Scale

- Distributed event bus (NATS/Kafka) behind the existing `EventBus` interface.
- Multi-region deployment, rate limiting, cost-based model routing.
- Observability: tracing per turn across engines and providers.
