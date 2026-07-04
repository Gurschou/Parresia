/**
 * Typed in-process event bus.
 *
 * SYNAPSE is event-driven: engines publish domain events (message received,
 * pattern detected, decision analyzed, reflection completed) and other
 * engines subscribe without direct coupling. The same contract can later be
 * backed by a distributed broker (NATS, Kafka) without changing publishers
 * or subscribers.
 */
import type { DetectedPattern } from "./domain/pattern.js";
import type { EmotionalSnapshot } from "./domain/emotion.js";
import type { DecisionAnalysis } from "./domain/decision.js";
import type { MemoryRecord } from "./domain/memory.js";

export interface DomainEventMap {
  "conversation.message": {
    userId: string;
    sessionId: string;
    role: "user" | "assistant";
    content: string;
  };
  "pattern.detected": { userId: string; pattern: DetectedPattern };
  "emotion.analyzed": { userId: string; snapshot: EmotionalSnapshot };
  "decision.analyzed": { userId: string; analysis: DecisionAnalysis };
  "memory.stored": { userId: string; record: MemoryRecord };
  "reflection.completed": {
    userId: string;
    sessionId: string;
    insights: string[];
  };
  "coach.commitment": {
    userId: string;
    action: string;
    due?: string;
  };
}

export type DomainEventName = keyof DomainEventMap;

export type EventHandler<K extends DomainEventName> = (
  payload: DomainEventMap[K],
) => void | Promise<void>;

export interface EventBus {
  publish<K extends DomainEventName>(
    event: K,
    payload: DomainEventMap[K],
  ): Promise<void>;
  subscribe<K extends DomainEventName>(
    event: K,
    handler: EventHandler<K>,
  ): () => void;
}

/** Default in-process implementation. Handlers run sequentially; a failing
 * handler is isolated so one subscriber cannot break the others. */
export class InProcessEventBus implements EventBus {
  private readonly handlers = new Map<DomainEventName, Set<EventHandler<never>>>();
  private readonly onError: (event: string, error: unknown) => void;

  constructor(onError?: (event: string, error: unknown) => void) {
    this.onError = onError ?? (() => undefined);
  }

  async publish<K extends DomainEventName>(
    event: K,
    payload: DomainEventMap[K],
  ): Promise<void> {
    const subs = this.handlers.get(event);
    if (!subs) return;
    for (const handler of subs) {
      try {
        await (handler as EventHandler<K>)(payload);
      } catch (error) {
        this.onError(event, error);
      }
    }
  }

  subscribe<K extends DomainEventName>(
    event: K,
    handler: EventHandler<K>,
  ): () => void {
    let subs = this.handlers.get(event);
    if (!subs) {
      subs = new Set();
      this.handlers.set(event, subs);
    }
    subs.add(handler as EventHandler<never>);
    return () => subs.delete(handler as EventHandler<never>);
  }
}
