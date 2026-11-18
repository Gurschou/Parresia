import { heuristicMatches } from "../insights/belief-match";
import { extractInventory } from "../prompt/build-belief-match-message";
import { generateMockAnalysis } from "../testing/mock-analysis";
import type { LlmClient, LlmRequest, LlmResponse } from "./types";
import { sleep } from "./retry";

/**
 * Mock-provider (LLM_PROVIDER=mock): kræver ingen API-nøgle. Udtrækker
 * transskriptet fra brugerbeskeden og returnerer en schema-gyldig analyse
 * som JSON-tekst, så hele parse/valider-kæden køres præcis som med Claude.
 */
export class MockLlmClient implements LlmClient {
  readonly provider = "mock" as const;
  readonly model = "mock-behavioral-modeler";

  constructor(private readonly opts: { delayMs?: number } = {}) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    // Overbevisnings-match: svar med den tekstbaserede match i schema-form.
    const inventory = extractInventory(req.userMessage);
    if (inventory) {
      const text = JSON.stringify(heuristicMatches(inventory));
      if (this.opts.delayMs) await sleep(this.opts.delayMs / 2, req.signal);
      req.onText?.(text.length);
      return {
        text,
        stopReason: "end_turn",
        model: this.model,
        usage: { inputTokens: Math.round(req.userMessage.length / 4), outputTokens: Math.round(text.length / 4) },
        fallbackUsed: false,
      };
    }
    const transcript = req.userMessage.match(/<transskript>\n([\s\S]*?)\n<\/transskript>/)?.[1] ?? req.userMessage;
    const subject = req.userMessage.match(/Person der modelleres: (.+)/)?.[1]?.trim();
    const goal = req.userMessage.match(/Resultat der ønskes modelleret: (.+)/)?.[1]?.trim();
    const text = JSON.stringify(generateMockAnalysis(transcript, { subjectName: subject, goal }));
    const delay = this.opts.delayMs ?? 0;
    // Simulér streaming i små bidder, så progress-UI kan testes.
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      if (delay) await sleep(delay / steps, req.signal);
      req.onText?.(Math.round((text.length * i) / steps));
    }
    return {
      text,
      stopReason: "end_turn",
      model: this.model,
      usage: { inputTokens: Math.round(req.userMessage.length / 4), outputTokens: Math.round(text.length / 4) },
      fallbackUsed: false,
    };
  }
}
