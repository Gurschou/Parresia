# SYNAPSE — Memory

Memory is what makes SYNAPSE personal. It is **retrieved intelligently, not just stored**.

## Layers

| Layer | Half-life (recall decay) | Contents |
| --- | --- | --- |
| `session` | 12 hours | Working memory of the current conversation |
| `short-term` | 7 days | Recent commitments, temporary context |
| `long-term` | 120 days | Durable facts, reflections, conversation history |
| `identity` | 365 days | Goals, values, beliefs, habits, breakthroughs, the user's own vocabulary |
| `learning` | 180 days | What SYNAPSE has learned about how to help this user |

## Record kinds

`fact`, `goal`, `value`, `belief`, `habit`, `commitment`, `breakthrough`, `conversation`, `reflection`, `pattern`, `preference`.

## Hybrid recall

`rankMemories` scores each candidate as a weighted blend:

| Signal | Weight | Notes |
| --- | --- | --- |
| Semantic similarity | 0.45 | Embedding cosine when embeddings exist; lexical token overlap as fallback |
| Recency | 0.25 | Exponential decay with per-layer half-life |
| Importance | 0.20 | Assigned at storage time (0..1) |
| Reinforcement | 0.10 | `accessCount` — memories that prove useful get easier to recall |

Recalling a memory updates `lastAccessedAt` and `accessCount`, so useful memories strengthen over time — a deliberate imitation of human memory consolidation.

## Prompt context

`MemoryEngine.buildContext(userId, topic)` produces a quiet context block:

- Identity memories (always relevant): values, goals, beliefs, habits.
- Topic-relevant memories from long-term/short-term/learning layers.

The coach is instructed to use this context "quietly and precisely — never quote it as an archive".

## Automatic extraction

On session end, `extractFromConversation` sends the transcript to a fast model (`memory-extraction` task, temperature 0, JSON mode) and stores only validated kinds. Extraction failure stores nothing — wrong memories are worse than no memories.

## Stores

`MemoryStore` is a port. Implementations:

- `InMemoryStore` — tests, ephemeral runs.
- `FileMemoryStore` — local development (JSON under `./data`).
- Planned: Postgres + pgvector adapter with real embeddings for semantic search (see Roadmap).
