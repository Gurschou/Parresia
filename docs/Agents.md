# SYNAPSE — Agents

## Model

Every agent implements one interface:

```ts
interface Agent {
  readonly id: string;
  readonly description: string; // used by the Router Agent for selection
  handle(context: AgentContext): Promise<Result<AgentReply>>;
}
```

`AgentContext` carries the conversation, quiet memory context, active patterns (confidence ≥ 0.5, top 5) and the latest emotional snapshot. `AgentReply` can attach structured artifacts (e.g. a full `DecisionAnalysis`) for rich UI rendering.

## Current agents

| Agent | Role |
| --- | --- |
| **Router Agent** | Classifies each user turn against the agent catalog using a fast model. Fails safe to the coach: the user always gets an answer. |
| **Coach Agent** | Default specialist. Powerful questions, challenges assumptions, names patterns with their why, drives toward action, follows up on commitments. |
| **Decision Agent** | Runs the Decision Engine for choice/dilemma turns and renders the full analysis (signal, root cause, trade-offs, blind spots, 1st/2nd/3rd-order consequences, recommendations, confidence, reflection question). |

## Orchestration

`SynapseOrchestrator.handleMessage` per turn:

1. Record the user message, publish `conversation.message`.
2. In parallel: emotional analysis, memory context build, pattern load.
3. Router Agent selects the specialist; specialist answers with full context.
4. Record the reply; run pattern detection on the recent transcript (enrichment — never blocks or fails the reply).

`SynapseOrchestrator.endSession`:

1. Reflection Engine distills insights, commitments and a carry-forward question.
2. Insights → long-term memory; commitments → short-term memory (status `open`).
3. Memory extraction distills durable identity/long-term memories.

## Adding an agent

Implement `Agent`, pass it via `extraAgents` when constructing the orchestrator. The Router Agent automatically includes its `description` in the routing catalog — no orchestrator changes. Planned specialists: psychology, leadership, learning, research, strategy, health.
