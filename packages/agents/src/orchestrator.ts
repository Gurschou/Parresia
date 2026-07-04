/**
 * SynapseOrchestrator — the application service that makes all engines and
 * agents feel like one intelligence.
 *
 * Per turn:
 *  1. Analyze the user's emotional state (parallel with memory recall).
 *  2. Build quiet memory context and load active patterns.
 *  3. Router Agent picks the specialist; the specialist answers.
 *  4. Conversation is recorded; pattern detection runs on the updated
 *     transcript (its failures never block the reply).
 *
 * On session end:
 *  - Reflection Engine distills insights and commitments.
 *  - Memory Engine extracts durable memories.
 *  - Both are stored for future sessions.
 */
import {
  err,
  newId,
  nowIso,
  ok,
  NotFoundError,
  type DetectedPattern,
  type EmotionalSnapshot,
  type EventBus,
  type Message,
  type Result,
} from "@synapse/shared";
import type { ModelRouter } from "@synapse/ai";
import { MemoryEngine } from "@synapse/memory";
import {
  EmotionalEngine,
  PatternEngine,
  ReflectionEngine,
  computeGrowthMetrics,
  type PatternRepository,
  type SessionReflection,
} from "@synapse/intelligence";
import type { Agent, AgentReply } from "./types.js";
import { RouterAgent } from "./router-agent.js";
import { CoachAgent } from "./coach-agent.js";
import { DecisionAgent } from "./decision-agent.js";

export interface OrchestratorDeps {
  router: ModelRouter;
  memory: MemoryEngine;
  patternRepository: PatternRepository;
  events?: EventBus;
  /** Additional specialists beyond the built-in coach + decision agents. */
  extraAgents?: Agent[];
}

export interface TurnResult {
  reply: AgentReply;
  message: Message;
  emotionalState?: EmotionalSnapshot;
}

interface SessionState {
  userId: string;
  messages: Message[];
  snapshots: EmotionalSnapshot[];
}

export class SynapseOrchestrator {
  private readonly emotional: EmotionalEngine;
  private readonly patterns: PatternEngine;
  private readonly reflection: ReflectionEngine;
  private readonly routerAgent: RouterAgent;
  private readonly agents = new Map<string, Agent>();
  private readonly sessions = new Map<string, SessionState>();

  constructor(private readonly deps: OrchestratorDeps) {
    this.emotional = new EmotionalEngine(deps.router, deps.events);
    this.patterns = new PatternEngine(
      deps.router,
      deps.patternRepository,
      deps.events,
    );
    this.reflection = new ReflectionEngine(deps.router, deps.events);
    for (const agent of [
      new CoachAgent(deps.router),
      new DecisionAgent(deps.router, deps.events),
      ...(deps.extraAgents ?? []),
    ]) {
      this.agents.set(agent.id, agent);
    }
    this.routerAgent = new RouterAgent(deps.router, this.agents);
  }

  startSession(userId: string): string {
    const sessionId = newId("ses");
    this.sessions.set(sessionId, { userId, messages: [], snapshots: [] });
    return sessionId;
  }

  getSessionMessages(sessionId: string): Message[] {
    return this.sessions.get(sessionId)?.messages ?? [];
  }

  async handleMessage(
    sessionId: string,
    text: string,
  ): Promise<Result<TurnResult>> {
    const session = this.sessions.get(sessionId);
    if (!session) return err(new NotFoundError("session", sessionId));
    const { userId } = session;

    const userMessage: Message = {
      id: newId("msg"),
      sessionId,
      role: "user",
      content: text,
      createdAt: nowIso(),
    };
    session.messages.push(userMessage);
    await this.deps.events?.publish("conversation.message", {
      userId,
      sessionId,
      role: "user",
      content: text,
    });

    // Emotional read, memory recall and pattern load are independent.
    const [emotionResult, memoryContext, activePatterns] = await Promise.all([
      this.emotional.analyze({ userId, sessionId, text }),
      this.deps.memory.buildContext(userId, text),
      this.patterns.listPatterns(userId),
    ]);
    const emotionalState = emotionResult.ok ? emotionResult.value : undefined;
    if (emotionalState) session.snapshots.push(emotionalState);

    const agent = await this.routerAgent.route(text);
    const replyResult = await agent.handle({
      userId,
      sessionId,
      messages: session.messages.map(({ role, content }) => ({ role, content })),
      memoryContext,
      activePatterns: selectActivePatterns(activePatterns),
      emotionalState,
    });
    if (!replyResult.ok) return replyResult;
    const reply = replyResult.value;

    const assistantMessage: Message = {
      id: newId("msg"),
      sessionId,
      role: "assistant",
      content: reply.content,
      createdAt: nowIso(),
      agent: reply.agentId,
      model: reply.model,
    };
    session.messages.push(assistantMessage);
    await this.deps.events?.publish("conversation.message", {
      userId,
      sessionId,
      role: "assistant",
      content: reply.content,
    });

    // Pattern detection is enrichment — run it, but never fail the turn.
    await this.patterns
      .detect({
        userId,
        transcript: session.messages
          .slice(-8)
          .map((m) => `${m.role}: ${m.content}`)
          .join("\n"),
      })
      .catch(() => undefined);

    return ok({ reply, message: assistantMessage, emotionalState });
  }

  async endSession(sessionId: string): Promise<Result<SessionReflection>> {
    const session = this.sessions.get(sessionId);
    if (!session) return err(new NotFoundError("session", sessionId));
    const { userId, messages } = session;

    const reflectionResult = await this.reflection.reflect({
      userId,
      sessionId,
      messages: messages.map(({ role, content }) => ({ role, content })),
    });

    if (reflectionResult.ok) {
      for (const insight of reflectionResult.value.insights) {
        await this.deps.memory.remember({
          userId,
          layer: "long-term",
          kind: "reflection",
          content: insight,
          importance: 0.7,
        });
      }
      for (const commitment of reflectionResult.value.commitments) {
        await this.deps.memory.remember({
          userId,
          layer: "short-term",
          kind: "commitment",
          content: commitment.action,
          importance: 0.9,
          metadata: { due: commitment.due, status: "open" },
        });
      }
    }

    await this.deps.memory.extractFromConversation(
      userId,
      messages,
      this.deps.router,
    );

    this.sessions.delete(sessionId);
    return reflectionResult;
  }

  /** Compute current dashboard metrics from everything observed so far. */
  async metricsFor(userId: string): Promise<ReturnType<typeof computeGrowthMetrics>> {
    const patterns = await this.patterns.listPatterns(userId);
    const snapshots = [...this.sessions.values()]
      .filter((s) => s.userId === userId)
      .flatMap((s) => s.snapshots);
    const [reflections, commitments] = await Promise.all([
      this.deps.memory.recall({ userId, kinds: ["reflection"], limit: 100 }),
      this.deps.memory.recall({ userId, kinds: ["commitment"], limit: 100 }),
    ]);
    const completed = commitments.filter(
      ({ record }) => record.metadata?.status === "done",
    ).length;
    return computeGrowthMetrics({
      userId,
      snapshots,
      patterns,
      reflectionCount: reflections.length,
      sessionCount: Math.max(
        [...this.sessions.values()].filter((s) => s.userId === userId).length,
        reflections.length,
      ),
      commitmentsMade: commitments.length,
      commitmentsCompleted: completed,
    });
  }

}

/** Only surface patterns the system is reasonably confident about. */
function selectActivePatterns(patterns: DetectedPattern[]): DetectedPattern[] {
  return patterns
    .filter((p) => p.confidence >= 0.5)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
}
