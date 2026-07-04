/**
 * Router Agent — classifies each user turn and picks the right specialist.
 *
 * Uses a fast model for intent classification. Fails safe: if the model is
 * unavailable or returns an unknown agent id, the default agent (coach)
 * handles the turn so the user always gets an answer.
 */
import { parseModelJson, type ModelRouter } from "@synapse/ai";
import type { Agent } from "./types.js";

export class RouterAgent {
  constructor(
    private readonly router: ModelRouter,
    private readonly agents: Map<string, Agent>,
    private readonly defaultAgentId = "coach",
  ) {}

  async route(userMessage: string): Promise<Agent> {
    const fallback = this.agents.get(this.defaultAgentId);
    if (!fallback) {
      throw new Error(`default agent '${this.defaultAgentId}' not registered`);
    }
    if (this.agents.size === 1) return fallback;

    const catalog = [...this.agents.values()]
      .map((agent) => `- ${agent.id}: ${agent.description}`)
      .join("\n");
    const completion = await this.router.complete({
      task: "fast",
      json: true,
      temperature: 0,
      maxTokens: 100,
      messages: [
        {
          role: "system",
          content:
            "Du er SYNAPSEs router. Vælg den bedste agent til brugerens besked. " +
            `Agenter:\n${catalog}\n` +
            'Returnér KUN gyldig JSON: {"agent": "<agent-id>"}.',
        },
        { role: "user", content: userMessage },
      ],
    });
    if (!completion.ok) return fallback;
    const parsed = parseModelJson<{ agent?: string }>(completion.value.content);
    if (!parsed.ok) return fallback;
    return this.agents.get(parsed.value.agent ?? "") ?? fallback;
  }
}
