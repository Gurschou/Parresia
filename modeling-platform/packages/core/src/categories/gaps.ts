import { z } from "zod";
import { Priority } from "../schema/common";
import { PRIORITY_LABEL } from "../schema/labels";
import { defineCategory } from "./types";

/**
 * Mangler & næste spørgsmål refererer til de andre kategorier. Derfor
 * bygges den med en fabrik, der får de øvrige kategori-nøgler/titler fra
 * registret — så en ny kategori automatisk kan bruges som mål her.
 */
export function createGapsCategory(targets: { key: string; title: string }[]) {
  const keys = targets.map((t) => t.key) as [string, ...string[]];
  const title = (k: string) => targets.find((t) => t.key === k)?.title ?? k;
  const Target = z.enum(keys).describe("Den kategori fundet vedrører");

  return defineCategory({
    key: "gaps_and_next_questions",
    title: "Mangler & næste spørgsmål",
    description: "Hvad transskriptet ikke afslører — og de spørgsmål, der vil afdække det.",
    icon: "circle-help",
    instructions: `Vær ærlig om, hvad materialet IKKE afslører, og giv de bedste næste spørgsmål.
- gaps: 2-8 konkrete huller. category er en af: ${keys.join(", ")}.
- next_questions: 5-12 åbne, præcise spørgsmål man kan stille personen for at afdække strategier, overbevisninger, værdier m.m. Formulér dem, så de kan afkræfte en hypotese — ikke kun bekræfte den. purpose = hvad spørgsmålet skal afdække. Sortér efter priority (high først).`,
    schema: z.object({
      gaps: z.array(
        z.object({
          category: Target,
          description: z.string().describe("Hvad der mangler"),
          why_it_matters: z.string().describe("Hvorfor det er vigtigt for modellen"),
        }),
      ),
      next_questions: z.array(
        z.object({
          question: z.string(),
          purpose: z.string(),
          target_category: Target,
          priority: Priority,
        }),
      ),
    }),
    normalize: (d) => {
      const order = { high: 0, medium: 1, low: 2 } as const;
      return { ...d, next_questions: [...d.next_questions].sort((a, b) => order[a.priority] - order[b.priority]) };
    },
    count: (d) => d.gaps.length + d.next_questions.length,
    metrics: (d) => ({ gaps: d.gaps.length, questions: d.next_questions.length }),
    toReport: (d) => [
      { type: "subheading", text: "Mangler i materialet" },
      {
        type: "items",
        emptyText: "Ingen væsentlige mangler identificeret.",
        items: d.gaps.map((g) => ({
          title: g.description,
          body: g.why_it_matters,
          badges: [{ text: title(g.category), tone: "info" as const }],
        })),
      },
      { type: "subheading", text: "Foreslåede næste spørgsmål" },
      {
        type: "items",
        items: d.next_questions.map((q) => ({
          title: q.question,
          body: q.purpose,
          badges: [
            {
              text: PRIORITY_LABEL[q.priority],
              tone: q.priority === "high" ? ("warning" as const) : ("neutral" as const),
            },
            { text: title(q.target_category), tone: "info" as const },
          ],
        })),
      },
    ],
  });
}
