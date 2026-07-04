import { describe, expect, it } from "vitest";
import { unwrap } from "@synapse/shared";
import { MockModel, ModelRouter } from "@synapse/ai";
import { DecisionEngine } from "../src/decision.js";

describe("DecisionEngine", () => {
  it("produces a complete, validated decision analysis", async () => {
    const router = new ModelRouter([
      new MockModel({
        "decision-analysis": JSON.stringify({
          signal: "Brugeren spørger reelt om identitet, ikke jobtitel",
          patterns: ["Søger ekstern validering ved store valg"],
          rootCause: "Uklarhed om egne kriterier for succes",
          humanNeeds: ["tryghed", "mening"],
          tradeOffs: ["løn vs. mening"],
          blindSpots: ["antager at det nuværende job er det sikre valg"],
          options: [
            {
              label: "Bliv i jobbet",
              summary: "Stabilitet, kendt terræn",
              consequences: {
                firstOrder: "Ro på økonomien",
                secondOrder: "Voksende rastløshed",
                thirdOrder: "Risiko for udbrændthed om 2-3 år",
              },
              risk: "Stagnation",
              opportunity: "Forfremmelse",
              alignment: 0.4,
            },
          ],
          recommendedActions: [
            {
              action: "Definér tre kriterier for et meningsfuldt arbejdsliv",
              rationale: "Uden egne kriterier bliver enhver mulighed et gæt",
              timeframe: "this-week",
            },
          ],
          confidenceScore: 0.72,
          alternativePaths: ["Intern rolleændring"],
          reflectionQuestion: "Hvad ville du vælge, hvis ingen så med?",
        }),
      }),
    ]);
    const engine = new DecisionEngine(router);
    const analysis = unwrap(
      await engine.analyze({ userId: "u1", question: "Skal jeg skifte job?" }),
    );
    expect(analysis.signal).toContain("identitet");
    expect(analysis.options[0]?.consequences.thirdOrder).toContain("udbrændthed");
    expect(analysis.recommendedActions[0]?.timeframe).toBe("this-week");
    expect(analysis.confidenceScore).toBeCloseTo(0.72);
    expect(analysis.reflectionQuestion.length).toBeGreaterThan(0);
  });

  it("defaults invalid timeframes and clamps confidence", async () => {
    const router = new ModelRouter([
      new MockModel({
        "decision-analysis": JSON.stringify({
          recommendedActions: [{ action: "gør noget", timeframe: "someday" }],
          confidenceScore: 7,
        }),
      }),
    ]);
    const analysis = unwrap(
      await new DecisionEngine(router).analyze({
        userId: "u1",
        question: "?",
      }),
    );
    expect(analysis.recommendedActions[0]?.timeframe).toBe("this-week");
    expect(analysis.confidenceScore).toBe(1);
  });
});
