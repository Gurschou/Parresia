/**
 * SynapseX Pipeline — Atlet → Briefing → Coach.
 *
 * One pipeline, two phases:
 *  - Fase A (intake): the athlete talks with SynapseX. The engine opens the
 *    conversation itself and is transparent about the briefing.
 *  - Fase B (briefing): the finished conversation is converted to a
 *    structured briefing the coach reads before the session.
 *
 * Briefings are persisted per athlete, and previous core insights are fed
 * back into both phases so recurring themes can be flagged
 * ("tredje gang på to uger han nævner søvn").
 */
import {
  err,
  newId,
  nowIso,
  NotFoundError,
  ValidationError,
  type Message,
  type Result,
} from "@synapse/shared";
import type { ModelRouter } from "@synapse/ai";
import {
  BriefingEngine,
  IntakeEngine,
  intakeOpening,
  type Briefing,
} from "@synapse/intelligence";

export interface BriefingRepository {
  save(briefing: Briefing): Promise<void>;
  listByUser(userId: string): Promise<Briefing[]>;
}

export class InMemoryBriefingRepository implements BriefingRepository {
  private readonly briefings = new Map<string, Briefing>();

  async save(briefing: Briefing): Promise<void> {
    this.briefings.set(briefing.id, briefing);
  }

  async listByUser(userId: string): Promise<Briefing[]> {
    return [...this.briefings.values()]
      .filter((b) => b.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

interface IntakeSession {
  userId: string;
  athleteName: string;
  coachName?: string;
  messages: Message[];
}

export class SynapseXPipeline {
  private readonly intake: IntakeEngine;
  private readonly briefing: BriefingEngine;
  private readonly sessions = new Map<string, IntakeSession>();

  constructor(
    router: ModelRouter,
    private readonly briefings: BriefingRepository,
  ) {
    this.intake = new IntakeEngine(router);
    this.briefing = new BriefingEngine(router);
  }

  /** Start Fase A. SynapseX opens the conversation itself. */
  startIntake(input: {
    userId: string;
    athleteName?: string;
    coachName?: string;
  }): { sessionId: string; opening: string } {
    const sessionId = newId("sxi");
    const opening = intakeOpening(input.coachName);
    const session: IntakeSession = {
      userId: input.userId,
      athleteName: input.athleteName ?? "Atlet",
      coachName: input.coachName,
      messages: [
        {
          id: newId("msg"),
          sessionId,
          role: "assistant",
          content: opening,
          createdAt: nowIso(),
          agent: "synapsex",
        },
      ],
    };
    this.sessions.set(sessionId, session);
    return { sessionId, opening };
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  async handleMessage(
    sessionId: string,
    text: string,
  ): Promise<Result<{ content: string; model: string }>> {
    const session = this.sessions.get(sessionId);
    if (!session) return err(new NotFoundError("intake session", sessionId));

    session.messages.push({
      id: newId("msg"),
      sessionId,
      role: "user",
      content: text,
      createdAt: nowIso(),
    });

    const history = await this.recentInsights(session.userId);
    const result = await this.intake.respond({
      messages: session.messages.map(({ role, content }) => ({ role, content })),
      athleteName: session.athleteName,
      briefingHistory: history,
    });
    if (!result.ok) return result;

    session.messages.push({
      id: newId("msg"),
      sessionId,
      role: "assistant",
      content: result.value.content,
      createdAt: nowIso(),
      agent: "synapsex",
      model: `${result.value.provider}/${result.value.model}`,
    });
    return {
      ok: true,
      value: {
        content: result.value.content,
        model: `${result.value.provider}/${result.value.model}`,
      },
    };
  }

  /** End Fase A → run Fase B and persist the briefing. */
  async endIntake(sessionId: string): Promise<Result<Briefing>> {
    const session = this.sessions.get(sessionId);
    if (!session) return err(new NotFoundError("intake session", sessionId));
    if (!session.messages.some((m) => m.role === "user")) {
      return err(
        new ValidationError("intake has no athlete messages to brief on"),
      );
    }
    const transcript = session.messages
      .map((m) => `${m.role === "user" ? "Atlet" : "SynapseX"}: ${m.content}`)
      .join("\n");
    const result = await this.briefing.generate({
      userId: session.userId,
      athleteName: session.athleteName,
      transcript,
      previousInsights: await this.recentInsights(session.userId),
    });
    if (!result.ok) return result;
    await this.briefings.save(result.value);
    this.sessions.delete(sessionId);
    return result;
  }

  listBriefings(userId: string): Promise<Briefing[]> {
    return this.briefings.listByUser(userId);
  }

  private async recentInsights(userId: string): Promise<string[]> {
    const previous = await this.briefings.listByUser(userId);
    return previous
      .slice(0, 3)
      .map((b) => b.kerneindsigt)
      .filter(Boolean);
  }
}
