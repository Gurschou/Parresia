import { z } from "zod";
import { evidenceFields } from "../schema/common";
import { evidenceBadges } from "../schema/labels";
import { defineCategory } from "./types";

export const BELIEF_TYPES = [
  "identity",
  "capability",
  "cause_effect",
  "complex_equivalence",
  "possibility",
  "value",
  "about_others",
  "about_world",
] as const;

export const BELIEF_TYPE_LABEL: Record<(typeof BELIEF_TYPES)[number], string> = {
  identity: "Identitet",
  capability: "Evne",
  cause_effect: "Årsag-virkning",
  complex_equivalence: "Kompleks ækvivalens",
  possibility: "Mulighed",
  value: "Værdi",
  about_others: "Om andre",
  about_world: "Om verden",
};

const beliefBase = {
  statement: z
    .string()
    .describe("Overbevisningen formuleret i første person, som personen opererer ud fra, fx 'Jeg er en person der …'"),
  belief_type: z.enum(BELIEF_TYPES),
  impact: z.string().describe("Hvordan overbevisningen styrer adfærd og resultater"),
  ...evidenceFields,
};

const EnablingBelief = z.object(beliefBase);
const DisenablingBelief = z.object({
  ...beliefBase,
  cost: z.string().describe("Hvad overbevisningen koster personen eller omgivelserne"),
  reframe_question: z
    .string()
    .describe("Ét åbent spørgsmål der kan udfordre eller åbne overbevisningen"),
});

export const enablingBeliefsCategory = defineCategory({
  key: "enabling_beliefs",
  title: "Styrkende overbevisninger",
  description: "Enabling beliefs — kommandoerne til nervesystemet, der gør resultatet muligt.",
  icon: "shield-check",
  instructions: `Udtræk 2-8 styrkende (enabling) overbevisninger.
- Formulér hver som et førstepersons-udsagn personen opererer ud fra. Identitetsniveau ("jeg er en person der …") er stærkest.
- belief_type: identity, capability, cause_effect, complex_equivalence (X betyder Y), possibility, value, about_others, about_world.
- Belæg hver med ordrette citater eller beskrevet adfærd; markér rene fortolkninger som inference.`,
  schema: z.object({ beliefs: z.array(EnablingBelief) }),
  count: (d) => d.beliefs.length,
  metrics: (d) => ({ count: d.beliefs.length }),
  toReport: (d) => [
    {
      type: "items",
      emptyText: "Ingen tydelige styrkende overbevisninger i materialet.",
      items: d.beliefs.map((b) => ({
        title: b.statement,
        body: b.impact,
        badges: [{ text: BELIEF_TYPE_LABEL[b.belief_type], tone: "positive" as const }, ...evidenceBadges(b)],
        quotes: b.quotes,
      })),
    },
  ],
});

export const disenablingBeliefsCategory = defineCategory({
  key: "disenabling_beliefs",
  title: "Begrænsende overbevisninger",
  description: "Disenabling beliefs — hvad der holder personen tilbage, og hvad det koster.",
  icon: "shield-alert",
  instructions: `Udtræk 0-8 begrænsende (disenabling) overbevisninger.
- Samme format som de styrkende, plus cost (hvad den koster) og reframe_question (ét åbent spørgsmål, der kan afkræfte eller åbne den — ikke en peptalk).
- Opfind ikke begrænsninger for at udfylde listen; tom liste er et gyldigt svar.`,
  schema: z.object({ beliefs: z.array(DisenablingBelief) }),
  count: (d) => d.beliefs.length,
  metrics: (d) => ({ count: d.beliefs.length }),
  toReport: (d) => [
    {
      type: "items",
      emptyText: "Ingen tydelige begrænsende overbevisninger i materialet.",
      items: d.beliefs.map((b) => ({
        title: b.statement,
        body: b.impact,
        badges: [{ text: BELIEF_TYPE_LABEL[b.belief_type], tone: "negative" as const }, ...evidenceBadges(b)],
        details: [
          { label: "Pris", value: b.cost },
          { label: "Reframe-spørgsmål", value: b.reframe_question },
        ],
        quotes: b.quotes,
      })),
    },
  ],
});
