import { z } from "zod";
import { Confidence, Quotes } from "../schema/common";
import { CONFIDENCE_LABEL, nonEmpty } from "../schema/labels";
import type { ReportBlock } from "../report/blocks";
import { defineCategory } from "./types";

const empowering = z
  .boolean()
  .describe("true hvis den giver handlekraft/styrke, false hvis den begrænser");

const MeaningItem = z.object({
  text: z.string().describe("Selve nøgleordet/metaforen/spørgsmålet"),
  meaning: z.string().describe("Hvilken betydning eller effekt det skaber for personen"),
  empowering,
  reconstructed: z.boolean().describe("true hvis du har rekonstrueret det (ikke ordret sagt)"),
  quote: z.string().describe("Ordret citat, eller tom streng"),
});

const AssignedMeaning = z.object({
  event: z.string().describe("Hændelsen/situationen"),
  meaning: z.string().describe("Den betydning personen tillægger den"),
  empowering,
  quote: z.string().describe("Ordret citat, eller tom streng"),
});

export const meaningMakersCategory = defineCategory({
  key: "meaning_makers",
  title: "Meaning-makers",
  description: "Fokus, sprog og fysiologi — de kræfter, der afgør hvilken betydning oplevelser får.",
  icon: "message-square-quote",
  instructions: `Udtræk personens meaning-makers (Robbins' triade: fokus, sprog, fysiologi) og de betydninger, de skaber.
- focus: hvad personen vanemæssigt fokuserer på (det der er/ikke er, det de kan/ikke kan kontrollere, fortid/nutid/fremtid).
- key_words: gennemgående ord og "transformational vocabulary" (fx ord for følelser, intensitet).
- metaphors: globale metaforer ("livet er en kamp", "jeg bærer det hele") og deres implicitte betydning.
- habitual_questions: de spørgsmål personen vanemæssigt stiller sig selv (fx "Hvordan kan jeg …?"). Markér rekonstruerede som reconstructed = true.
- assigned_meanings: hændelse → tillagt betydning (er den styrkende eller begrænsende?).
- physiology: KUN hvis kropsholdning, vejrtrækning, energi eller ritualer er eksplicit beskrevet i transskriptet. Udled aldrig kropssprog af tekst alene; sæt så observable = false.`,
  schema: z.object({
    focus: z.object({
      description: z.string().describe("Hvad personen vanemæssigt fokuserer på"),
      patterns: z.array(z.string()).describe("Konkrete fokusmønstre"),
      quotes: Quotes,
    }),
    key_words: z.array(MeaningItem),
    metaphors: z.array(MeaningItem),
    habitual_questions: z.array(MeaningItem),
    assigned_meanings: z.array(AssignedMeaning),
    physiology: z.object({
      observable: z.boolean().describe("true kun hvis fysiologi er eksplicit beskrevet i transskriptet"),
      description: z.string().describe("Beskrivelse, eller hvad man bør observere næste gang"),
      quotes: Quotes,
      confidence: Confidence,
    }),
  }),
  count: (d) => d.key_words.length + d.metaphors.length + d.habitual_questions.length + d.assigned_meanings.length,
  metrics: (d) => {
    const all = [...d.key_words, ...d.metaphors, ...d.habitual_questions, ...d.assigned_meanings];
    return {
      metaphors: d.metaphors.length,
      questions: d.habitual_questions.length,
      empowering_ratio: all.length ? all.filter((x) => x.empowering).length / all.length : 0,
    };
  },
  toReport: (d) => {
    const tone = (e: boolean) => (e ? ("positive" as const) : ("negative" as const));
    const badge = (e: boolean) => ({ text: e ? "Styrkende" : "Begrænsende", tone: tone(e) });
    const asItems = (xs: z.infer<typeof MeaningItem>[]) =>
      xs.map((x) => ({
        title: x.text,
        body: x.meaning,
        badges: [badge(x.empowering), ...(x.reconstructed ? [{ text: "Rekonstrueret", tone: "info" as const }] : [])],
        quotes: nonEmpty(x.quote) ? [x.quote] : [],
      }));
    const blocks: ReportBlock[] = [
      { type: "subheading", text: "Fokus" },
      { type: "paragraph", text: d.focus.description },
    ];
    if (d.focus.patterns.length) blocks.push({ type: "bullets", items: d.focus.patterns });
    d.focus.quotes.forEach((q) => blocks.push({ type: "quote", text: q }));
    if (d.key_words.length) {
      blocks.push({ type: "subheading", text: "Nøgleord" }, { type: "items", items: asItems(d.key_words) });
    }
    if (d.metaphors.length) {
      blocks.push({ type: "subheading", text: "Metaforer" }, { type: "items", items: asItems(d.metaphors) });
    }
    if (d.habitual_questions.length) {
      blocks.push(
        { type: "subheading", text: "Vanespørgsmål" },
        { type: "items", items: asItems(d.habitual_questions) },
      );
    }
    if (d.assigned_meanings.length) {
      blocks.push(
        { type: "subheading", text: "Tillagte betydninger" },
        {
          type: "items",
          items: d.assigned_meanings.map((m) => ({
            title: m.event,
            body: `→ ${m.meaning}`,
            badges: [badge(m.empowering)],
            quotes: nonEmpty(m.quote) ? [m.quote] : [],
          })),
        },
      );
    }
    blocks.push({ type: "subheading", text: "Fysiologi" });
    blocks.push(
      d.physiology.observable
        ? { type: "paragraph", text: d.physiology.description }
        : {
            type: "callout",
            tone: "warning",
            title: "Ikke observerbar i teksten",
            text: d.physiology.description || "Transskriptet beskriver ikke fysiologi eksplicit.",
          },
    );
    if (d.physiology.observable) {
      blocks.push({ type: "keyvalue", items: [{ label: "Sikkerhed", value: CONFIDENCE_LABEL[d.physiology.confidence] }] });
    }
    d.physiology.quotes.forEach((q) => blocks.push({ type: "quote", text: q }));
    return blocks;
  },
});
