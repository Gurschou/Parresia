import { z } from "zod";
import { Quotes, evidenceFields } from "../schema/common";
import { evidenceBadges, nonEmpty } from "../schema/labels";
import { defineCategory } from "./types";

/**
 * Bipolære meta-programmer. Rækkefølgen af polerne er kontrakten mellem
 * prompten (pole_a/pole_b) og dashboardet. Tilføj nye programmer her —
 * instruktioner, schema-enum og labels genereres automatisk.
 */
export const META_PROGRAMS = {
  toward_away: { name: "Retning", poles: ["Mod (toward)", "Væk fra (away from)"] },
  internal_external_reference: { name: "Referenceramme", poles: ["Intern reference", "Ekstern reference"] },
  options_procedures: { name: "Årsag", poles: ["Muligheder (options)", "Procedurer"] },
  general_specific: { name: "Chunk-størrelse", poles: ["Overordnet (global)", "Detaljeret (specifik)"] },
  proactive_reactive: { name: "Handlingsniveau", poles: ["Proaktiv", "Reaktiv/reflekterende"] },
  sameness_difference: { name: "Sammenligning", poles: ["Lighed (match)", "Forskel (mismatch)"] },
  self_other: { name: "Opmærksomhed", poles: ["Selv", "Andre"] },
  independent_cooperative: { name: "Arbejdsstil", poles: ["Selvstændig", "Samarbejdende"] },
  people_task: { name: "Primær interesse", poles: ["Mennesker", "Opgaver/ting"] },
  past_future: { name: "Tidsfokus", poles: ["Fortid", "Fremtid"] },
  in_time_through_time: { name: "Tidslinje", poles: ["I tiden (in-time)", "Gennem tiden (through-time)"] },
  associated_dissociated: { name: "Oplevelsesmåde", poles: ["Associeret", "Dissocieret"] },
} as const;

export type MetaProgramId = keyof typeof META_PROGRAMS;
export const META_PROGRAM_IDS = Object.keys(META_PROGRAMS) as MetaProgramId[];

const CONVINCER_CHANNELS = ["see", "hear", "read", "do", "unknown"] as const;
const CONVINCER_MODES = ["number_of_examples", "automatic", "consistent", "period_of_time", "unknown"] as const;

export const CONVINCER_CHANNEL_LABEL: Record<(typeof CONVINCER_CHANNELS)[number], string> = {
  see: "Se",
  hear: "Høre",
  read: "Læse",
  do: "Gøre",
  unknown: "Ukendt",
};
export const CONVINCER_MODE_LABEL: Record<(typeof CONVINCER_MODES)[number], string> = {
  number_of_examples: "Antal eksempler",
  automatic: "Automatisk",
  consistent: "Konsistent (aldrig helt overbevist)",
  period_of_time: "Over tid",
  unknown: "Ukendt",
};

const MetaProgram = z.object({
  program: z.enum(META_PROGRAM_IDS as [MetaProgramId, ...MetaProgramId[]]),
  leaning: z
    .enum(["pole_a", "pole_b", "balanced"])
    .describe("Hvilken pol personen hælder mod (se pole_a/pole_b i instruktionerne), eller balanced"),
  strength: z
    .number()
    .min(0)
    .max(100)
    .describe("0-100: hvor udtalt mønstret er (50 = svag tendens, 100 = meget udtalt)"),
  context: z.string().describe("Kontekst hvor mønstret viser sig (meta-programmer er kontekstafhængige)"),
  linguistic_markers: z.array(z.string()).describe("Sproglige markører, fx 'jeg ved det bare', 'skal', 'undgå'"),
  ...evidenceFields,
});

const programList = META_PROGRAM_IDS.map(
  (id) => `  - ${id}: ${META_PROGRAMS[id].name} — pole_a = ${META_PROGRAMS[id].poles[0]}, pole_b = ${META_PROGRAMS[id].poles[1]}`,
).join("\n");

export function metaProgramPoleLabel(id: MetaProgramId, leaning: "pole_a" | "pole_b" | "balanced"): string {
  const p = META_PROGRAMS[id];
  if (leaning === "balanced") return "Balanceret";
  return leaning === "pole_a" ? p.poles[0] : p.poles[1];
}

export const metaProgramsCategory = defineCategory({
  key: "meta_programs",
  title: "Meta-programmer",
  description: "Ubevidste sorteringsfiltre: hvordan personen motiveres, beslutter og sorterer information.",
  icon: "sliders-horizontal",
  instructions: `Identificér de meta-programmer, transskriptet giver belæg for (typisk 4-10). Brug KUN disse program-id'er og poler:
${programList}
- leaning: pole_a, pole_b eller balanced. strength: 0-100.
- linguistic_markers: de konkrete ord/vendinger der afslører mønstret.
- convincer: hvordan personen bliver overbevist (kanal: see/hear/read/do; mode: number_of_examples/automatic/consistent/period_of_time). Brug unknown hvis det ikke fremgår.
- Medtag ikke programmer uden belæg.`,
  schema: z.object({
    programs: z.array(MetaProgram),
    convincer: z.object({
      channel: z.enum(CONVINCER_CHANNELS),
      mode: z.enum(CONVINCER_MODES),
      description: z.string().describe("Kort beskrivelse, eller tom streng"),
      quotes: Quotes,
    }),
  }),
  normalize: (d) => {
    // Én vurdering pr. program: behold den stærkeste ved dubletter.
    const best = new Map<string, (typeof d.programs)[number]>();
    for (const p of d.programs) {
      const cur = best.get(p.program);
      if (!cur || p.strength > cur.strength) best.set(p.program, p);
    }
    return { ...d, programs: [...best.values()] };
  },
  count: (d) => d.programs.length,
  metrics: (d) => ({ programs: d.programs.length }),
  toReport: (d) => [
    {
      type: "table",
      headers: ["Meta-program", "Mønster", "Styrke", "Sikkerhed"],
      rows: d.programs.map((p) => [
        META_PROGRAMS[p.program].name,
        metaProgramPoleLabel(p.program, p.leaning),
        `${Math.round(p.strength)}/100`,
        p.confidence === "high" ? "Høj" : p.confidence === "medium" ? "Middel" : "Lav",
      ]),
    },
    {
      type: "items",
      emptyText: "Transskriptet giver ikke belæg for meta-programmer.",
      items: d.programs.map((p) => ({
        title: `${META_PROGRAMS[p.program].name}: ${metaProgramPoleLabel(p.program, p.leaning)}`,
        body: p.context,
        badges: evidenceBadges(p),
        details: p.linguistic_markers.length
          ? [{ label: "Sproglige markører", value: p.linguistic_markers.map((m) => `“${m}”`).join(", ") }]
          : [],
        quotes: p.quotes,
      })),
    },
    { type: "subheading", text: "Convincer-strategi" },
    {
      type: "keyvalue",
      items: [
        { label: "Kanal", value: CONVINCER_CHANNEL_LABEL[d.convincer.channel] },
        { label: "Mode", value: CONVINCER_MODE_LABEL[d.convincer.mode] },
      ],
    },
    ...(nonEmpty(d.convincer.description) ? [{ type: "paragraph" as const, text: d.convincer.description }] : []),
    ...d.convincer.quotes.map((q) => ({ type: "quote" as const, text: q })),
  ],
});
