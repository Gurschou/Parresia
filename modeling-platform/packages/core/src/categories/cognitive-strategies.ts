import { z } from "zod";
import { RepSystem, evidenceFields } from "../schema/common";
import { REP_SYSTEM_LABEL, evidenceBadges, nonEmpty } from "../schema/labels";
import type { ReportBlock } from "../report/blocks";
import { defineCategory } from "./types";

const STRATEGY_TYPES = [
  "decision",
  "motivation",
  "learning",
  "convincer",
  "creativity",
  "performance",
  "relationship",
  "other",
] as const;

export const STRATEGY_TYPE_LABEL: Record<(typeof STRATEGY_TYPES)[number], string> = {
  decision: "Beslutning",
  motivation: "Motivation",
  learning: "Læring",
  convincer: "Overbevisning (convincer)",
  creativity: "Kreativitet",
  performance: "Præstation",
  relationship: "Relation",
  other: "Anden",
};

const StrategyStep = z.object({
  system: RepSystem,
  orientation: z
    .enum(["internal", "external"])
    .describe("internal (i) = indre oplevelse, external (e) = sanser verden udenfor"),
  temporal: z
    .enum(["remembered", "constructed", "unspecified"])
    .describe("remembered (r) = husket, constructed (c) = konstrueret/forestillet, unspecified = uklart"),
  description: z.string().describe("Hvad personen gør i dette trin, kort"),
  quote: z.string().describe("Ordret citat der belægger trinnet, eller tom streng"),
});

const Strategy = z.object({
  name: z.string().describe("Kort dansk navn på strategien, fx 'Beslutter hurtigt ud fra mavefornemmelse'"),
  strategy_type: z.enum(STRATEGY_TYPES),
  context: z.string().describe("Hvilket resultat strategien producerer og i hvilken kontekst"),
  trigger: z.string().describe("Hvad der sætter strategien i gang"),
  steps: z.array(StrategyStep).describe("Sekvensen af repræsentationer i rækkefølge"),
  notation: z.string().describe("NLP-notation, fx 'Ve → Ad → Kⁱ → Ve → Exit'"),
  tote: z.object({
    trigger: z.string().describe("Udløser/input til TOTE-løkken"),
    test: z.string().describe("Kriteriet/sammenligningen personen tester mod (hvad skal være opfyldt)"),
    operate: z.array(z.string()).describe("Operationer personen udfører for at mindske forskellen"),
    exit: z.string().describe("Hvornår/hvordan personen forlader løkken (exit-kriterium)"),
  }),
  transferable: z
    .boolean()
    .describe("true hvis strategien kan overføres til andre; false hvis den er kontekst/held/personlighed"),
  ...evidenceFields,
});

const stepLabel = (s: z.infer<typeof StrategyStep>) => {
  const sup = s.orientation === "internal" ? "i" : "e";
  const temp = s.temporal === "remembered" ? "r" : s.temporal === "constructed" ? "c" : "";
  return `${s.system}${sup}${temp ? `/${temp}` : ""}`;
};

export const cognitiveStrategiesCategory = defineCategory({
  key: "cognitive_strategies",
  title: "Kognitive strategier",
  description: "Den mentale syntaks: sekvenser af repræsentationer og TOTE-løkker, der producerer resultatet.",
  icon: "workflow",
  instructions: `Udtræk personens kognitive strategier (mental syntaks) — den rækkefølge af indre og ydre repræsentationer, der pålideligt producerer resultatet.
- Find 1-5 strategier. Prioritér konkrete anekdoter, beslutninger og vaner over polerede selvbeskrivelser ("se hvad de GØR, ikke hvad de SIGER de gør").
- steps: hver repræsentation i rækkefølge med system (V/A/K/O/G/Ad), orientering (internal/external) og temporal (remembered/constructed/unspecified).
- notation: klassisk NLP-notation, fx "Ve → Ad → Kⁱ → Exit".
- tote: Test (kriterium/sammenligning), Operate (handlinger), Exit (hvornår personen er færdig) samt udløseren.
- transferable: false hvis mønstret skyldes kontekst, held eller ressourcer frem for strategi.
- Er sekvensen kun delvist synlig, så beskriv det kendte og markér evidence_type = inference og lav sikkerhed.`,
  schema: z.object({
    strategies: z.array(Strategy),
    observations: z.string().describe("Tværgående observationer om strategierne, eller tom streng"),
  }),
  count: (d) => d.strategies.length,
  metrics: (d) => ({
    strategies: d.strategies.length,
    avg_steps: d.strategies.length
      ? d.strategies.reduce((a, s) => a + s.steps.length, 0) / d.strategies.length
      : 0,
  }),
  toReport: (d) => {
    const blocks: ReportBlock[] = [];
    if (d.strategies.length === 0) {
      blocks.push({ type: "callout", tone: "warning", text: "Transskriptet afslører ingen tydelig strategi." });
    }
    for (const s of d.strategies) {
      blocks.push({ type: "subheading", text: s.name });
      blocks.push({
        type: "items",
        items: [
          {
            title: STRATEGY_TYPE_LABEL[s.strategy_type],
            body: s.context,
            badges: [
              ...evidenceBadges(s),
              s.transferable
                ? { text: "Overførbar", tone: "positive" }
                : { text: "Kontekstbunden", tone: "warning" },
            ],
            details: [
              { label: "Udløser", value: s.trigger },
              { label: "Notation", value: s.notation },
            ],
            quotes: s.quotes,
          },
        ],
      });
      if (s.steps.length) {
        blocks.push({
          type: "flow",
          title: "Sekvens",
          steps: s.steps.map((st) => ({
            label: stepLabel(st),
            caption: `${REP_SYSTEM_LABEL[st.system]}: ${st.description}`,
          })),
        });
      }
      blocks.push({ type: "tote", ...s.tote });
    }
    if (nonEmpty(d.observations)) blocks.push({ type: "paragraph", text: d.observations });
    return blocks;
  },
});
