/**
 * Decision Agent — runs the full decision engine and renders the analysis
 * conversationally while attaching the structured artifact for the UI.
 */
import { map, type Result } from "@synapse/shared";
import type { ModelRouter } from "@synapse/ai";
import { DecisionEngine } from "@synapse/intelligence";
import type { EventBus, DecisionAnalysis } from "@synapse/shared";
import type { Agent, AgentContext, AgentReply } from "./types.js";

function renderAnalysis(analysis: DecisionAnalysis): string {
  const lines: string[] = [];
  if (analysis.signal) lines.push(`**Det egentlige spørgsmål:** ${analysis.signal}`);
  if (analysis.rootCause) lines.push(`**Rodårsag:** ${analysis.rootCause}`);
  if (analysis.tradeOffs.length)
    lines.push(`**Trade-offs:**\n${analysis.tradeOffs.map((t) => `- ${t}`).join("\n")}`);
  if (analysis.blindSpots.length)
    lines.push(`**Blinde vinkler:**\n${analysis.blindSpots.map((b) => `- ${b}`).join("\n")}`);
  for (const option of analysis.options) {
    lines.push(
      `**Mulighed: ${option.label}** — ${option.summary}\n` +
        `- 1. orden: ${option.consequences.firstOrder}\n` +
        `- 2. orden: ${option.consequences.secondOrder}\n` +
        `- 3. orden: ${option.consequences.thirdOrder}\n` +
        `- Risiko: ${option.risk} · Mulighed: ${option.opportunity}`,
    );
  }
  if (analysis.recommendedActions.length)
    lines.push(
      `**Anbefalede handlinger:**\n${analysis.recommendedActions
        .map((a) => `- ${a.action} (${a.timeframe}) — ${a.rationale}`)
        .join("\n")}`,
    );
  lines.push(`**Sikkerhed i analysen:** ${Math.round(analysis.confidenceScore * 100)}%`);
  if (analysis.reflectionQuestion)
    lines.push(`**Refleksionsspørgsmål:** ${analysis.reflectionQuestion}`);
  return lines.join("\n\n");
}

export class DecisionAgent implements Agent {
  readonly id = "decision";
  readonly description =
    "Beslutninger, dilemmaer, valg mellem muligheder, 'skal jeg…'-spørgsmål, afvejning af konsekvenser og risici.";

  private readonly engine: DecisionEngine;

  constructor(router: ModelRouter, events?: EventBus) {
    this.engine = new DecisionEngine(router, events);
  }

  async handle(context: AgentContext): Promise<Result<AgentReply>> {
    const lastUser = [...context.messages]
      .reverse()
      .find((m) => m.role === "user");
    const result = await this.engine.analyze({
      userId: context.userId,
      question: lastUser?.content ?? "",
      context:
        [
          context.memoryContext,
          context.activePatterns.length
            ? "Kendte mønstre: " +
              context.activePatterns.map((p) => `${p.label} (${p.why})`).join("; ")
            : "",
        ]
          .filter(Boolean)
          .join("\n\n") || undefined,
    });
    return map(result, (analysis) => ({
      agentId: this.id,
      content: renderAnalysis(analysis),
      model: "decision-engine",
      artifacts: { decision: analysis },
    }));
  }
}
