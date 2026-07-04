/** Coach Agent — default specialist for growth conversations. */
import { map, type Result } from "@synapse/shared";
import type { ModelRouter } from "@synapse/ai";
import { CoachEngine } from "@synapse/intelligence";
import type { Agent, AgentContext, AgentReply } from "./types.js";

export class CoachAgent implements Agent {
  readonly id = "coach";
  readonly description =
    "Personlig udvikling, mønstre, følelser, vaner, ansvarlighed, refleksion og alle almindelige samtaler.";

  private readonly engine: CoachEngine;

  constructor(router: ModelRouter) {
    this.engine = new CoachEngine(router);
  }

  async handle(context: AgentContext): Promise<Result<AgentReply>> {
    const result = await this.engine.respond({
      messages: context.messages,
      memoryContext: context.memoryContext,
      activePatterns: context.activePatterns,
      emotionalState: context.emotionalState,
    });
    return map(result, (response) => ({
      agentId: this.id,
      content: response.content,
      model: `${response.provider}/${response.model}`,
    }));
  }
}
