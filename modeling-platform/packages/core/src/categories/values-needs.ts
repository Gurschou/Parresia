import { z } from "zod";
import { Confidence, HUMAN_NEEDS, HumanNeedKey, Quotes, evidenceFields } from "../schema/common";
import { CONFIDENCE_LABEL, HUMAN_NEED_LABEL, evidenceBadges, nonEmpty } from "../schema/labels";
import { defineCategory } from "./types";

const Value = z.object({
  value: z.string().describe("Værdien med personens egne ord, fx 'Frihed'"),
  direction: z
    .enum(["toward", "away_from"])
    .describe("toward = noget personen bevæger sig hen imod; away_from = noget personen undgår"),
  rank: z
    .number()
    .int()
    .min(0)
    .describe("Relativ rang (1 = vigtigst). 0 hvis rangen ikke kan udledes"),
  rule: z
    .string()
    .describe("Personens regel for værdien: 'For at føle X skal Y ske'. Tom streng hvis den ikke kan rekonstrueres"),
  ...evidenceFields,
});

const NeedAssessment = z.object({
  score: z
    .number()
    .min(0)
    .max(10)
    .describe("0-10: hvor stærkt behovet ser ud til at drive den aktuelle adfærd"),
  how_met: z.string().describe("Hvordan behovet opfyldes (køretøjer/strategier), eller tom streng"),
  cost: z.string().describe("Hvad måden at opfylde behovet på koster, eller tom streng"),
  quotes: Quotes,
  confidence: Confidence,
});

const needsShape = Object.fromEntries(HUMAN_NEEDS.map((n) => [n, NeedAssessment])) as Record<
  (typeof HUMAN_NEEDS)[number],
  typeof NeedAssessment
>;

export const valuesNeedsCategory = defineCategory({
  key: "values_and_6_human_needs",
  title: "Værdier & 6 Human Needs",
  description: "Hvad der betyder mest, reglerne bag, og hvilke af de seks menneskelige behov der er brændstoffet.",
  icon: "heart-pulse",
  instructions: `Udtræk værdier og en profil over de 6 Human Needs.
- values: 3-10 værdier med personens egne ord. direction = toward/away_from. rank = relativ rækkefølge (1 = vigtigst) eller 0 hvis ukendt. rule = "For at føle X skal Y ske" hvis den kan rekonstrueres (markér rekonstruktioner som inference).
- human_needs: vurdér ALLE seks behov (certainty, variety, significance, love_connection, growth, contribution) med score 0-10, hvordan behovet opfyldes (how_met) og prisen (cost). Uden belæg: lav score, lav sikkerhed og tomme citater.
- dominant_needs: de (højst) to behov der tydeligst driver adfærden — det forklarer, hvorfor mønstrene holdes ved lige.
- Udled ikke et generelt behovshierarki fra én enkelt situation; sig det i needs_summary hvis grundlaget er tyndt.`,
  schema: z.object({
    values: z.array(Value),
    human_needs: z.object(needsShape),
    dominant_needs: z.array(HumanNeedKey).describe("De to dominerende behov"),
    needs_summary: z.string().describe("2-4 sætninger om behovsprofilen"),
  }),
  normalize: (d) => ({ ...d, dominant_needs: Array.from(new Set(d.dominant_needs)).slice(0, 2) }),
  count: (d) => d.values.length,
  metrics: (d) => ({
    values: d.values.length,
    ...Object.fromEntries(HUMAN_NEEDS.map((n) => [`need_${n}`, d.human_needs[n].score])),
  }),
  toReport: (d) => [
    { type: "subheading", text: "Værdier" },
    {
      type: "items",
      emptyText: "Ingen tydelige værdier i materialet.",
      items: [...d.values]
        .sort((a, b) => (a.rank || 99) - (b.rank || 99))
        .map((v) => ({
          title: `${v.rank ? `${v.rank}. ` : ""}${v.value}`,
          badges: [
            v.direction === "toward"
              ? { text: "Mod", tone: "positive" as const }
              : { text: "Væk fra", tone: "negative" as const },
            ...evidenceBadges(v),
          ],
          details: nonEmpty(v.rule) ? [{ label: "Regel", value: v.rule }] : [],
          quotes: v.quotes,
        })),
    },
    { type: "subheading", text: "De 6 Human Needs" },
    {
      type: "bars",
      max: 10,
      unit: "/10",
      items: HUMAN_NEEDS.map((n) => ({
        label: HUMAN_NEED_LABEL[n],
        value: Math.round(d.human_needs[n].score * 10) / 10,
        highlight: d.dominant_needs.includes(n),
      })),
    },
    { type: "paragraph", text: d.needs_summary },
    {
      type: "items",
      items: HUMAN_NEEDS.filter((n) => nonEmpty(d.human_needs[n].how_met)).map((n) => {
        const a = d.human_needs[n];
        return {
          title: `${HUMAN_NEED_LABEL[n]} — ${a.score}/10`,
          body: a.how_met,
          badges: [
            ...(d.dominant_needs.includes(n) ? [{ text: "Dominerende", tone: "info" as const }] : []),
            { text: CONFIDENCE_LABEL[a.confidence] },
          ],
          details: nonEmpty(a.cost) ? [{ label: "Pris", value: a.cost }] : [],
          quotes: a.quotes,
        };
      }),
    },
  ],
});
