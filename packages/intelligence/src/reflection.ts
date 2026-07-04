/**
 * Reflection Engine — closes the transformation loop.
 *
 * At the end of a session it distills insights, surfaces what the user
 * committed to, and produces one question to carry forward. Insights are
 * published so memory and growth metrics update.
 */
import {
  err,
  ok,
  type EventBus,
  type Message,
  type Result,
} from "@synapse/shared";
import { parseModelJson, type ModelRouter } from "@synapse/ai";

export interface SessionReflection {
  insights: string[];
  commitments: { action: string; due?: string }[];
  carryForwardQuestion: string;
  summary: string;
}

interface RawReflection {
  insights?: string[];
  commitments?: { action?: string; due?: string }[];
  carryForwardQuestion?: string;
  summary?: string;
}

export class ReflectionEngine {
  constructor(
    private readonly router: ModelRouter,
    private readonly events?: EventBus,
  ) {}

  async reflect(input: {
    userId: string;
    sessionId: string;
    messages: Pick<Message, "role" | "content">[];
  }): Promise<Result<SessionReflection>> {
    const transcript = input.messages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");
    const completion = await this.router.complete({
      task: "summarization",
      json: true,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Du er SYNAPSEs refleksionsmodul. Læs sessionen og returnér KUN gyldig JSON: " +
            '{"insights": ["de vigtigste indsigter fra sessionen"], ' +
            '"commitments": [{"action": "hvad brugeren forpligtede sig til", "due": "ISO-dato hvis nævnt"}], ' +
            '"carryForwardQuestion": "ét spørgsmål brugeren bør bære med sig", ' +
            '"summary": "to-tre sætninger om sessionen"}. ' +
            "Medtag kun det der faktisk skete i sessionen.",
        },
        { role: "user", content: transcript },
      ],
    });
    if (!completion.ok) return completion;
    const parsed = parseModelJson<RawReflection>(completion.value.content);
    if (!parsed.ok) return err(parsed.error);
    const raw = parsed.value;
    const reflection: SessionReflection = {
      insights: raw.insights ?? [],
      commitments: (raw.commitments ?? [])
        .filter((c) => c?.action)
        .map((c) => ({ action: c.action ?? "", due: c.due })),
      carryForwardQuestion: raw.carryForwardQuestion ?? "",
      summary: raw.summary ?? "",
    };
    await this.events?.publish("reflection.completed", {
      userId: input.userId,
      sessionId: input.sessionId,
      insights: reflection.insights,
    });
    for (const commitment of reflection.commitments) {
      await this.events?.publish("coach.commitment", {
        userId: input.userId,
        action: commitment.action,
        due: commitment.due,
      });
    }
    return ok(reflection);
  }
}
