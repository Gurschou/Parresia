/**
 * Multi-agent contracts.
 *
 * An Agent is a focused capability with a stable id and description. The
 * Router Agent classifies each user turn and the orchestrator dispatches to
 * the winning agent. New agents (psychology, leadership, research, health…)
 * are added by registering another implementation — no orchestrator changes.
 */
import type {
  DecisionAnalysis,
  DetectedPattern,
  EmotionalSnapshot,
  Message,
  Result,
} from "@synapse/shared";

export interface AgentContext {
  userId: string;
  sessionId: string;
  /** Conversation so far, oldest first, including the new user message. */
  messages: Pick<Message, "role" | "content">[];
  memoryContext: string;
  activePatterns: DetectedPattern[];
  emotionalState?: EmotionalSnapshot;
}

export interface AgentReply {
  agentId: string;
  content: string;
  /** Which underlying model produced the reply. */
  model: string;
  /** Structured artifacts, e.g. a DecisionAnalysis, for rich UI rendering. */
  artifacts?: { decision?: DecisionAnalysis };
}

export interface Agent {
  readonly id: string;
  /** Used by the Router Agent to pick the right specialist. */
  readonly description: string;
  handle(context: AgentContext): Promise<Result<AgentReply>>;
}
