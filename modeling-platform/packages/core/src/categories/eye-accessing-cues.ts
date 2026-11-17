import { z } from "zod";
import { Confidence } from "../schema/common";
import { CONFIDENCE_LABEL, nonEmpty } from "../schema/labels";
import { defineCategory } from "./types";

const BASIS = ["observed_annotations", "inferred_from_language", "not_available"] as const;
const DIRECTIONS = [
  "up_left",
  "up_right",
  "lateral_left",
  "lateral_right",
  "down_left",
  "down_right",
  "defocused",
  "unspecified",
] as const;
const ACCESSED = ["Vr", "Vc", "Ar", "Ac", "K", "Ad", "unknown"] as const;

export const EYE_BASIS_LABEL: Record<(typeof BASIS)[number], string> = {
  observed_annotations: "Observeret (annoteret i transskriptet)",
  inferred_from_language: "Udledt af sprog — ikke observeret",
  not_available: "Ikke tilgængelig i materialet",
};
export const EYE_DIRECTION_LABEL: Record<(typeof DIRECTIONS)[number], string> = {
  up_left: "Op til venstre",
  up_right: "Op til højre",
  lateral_left: "Vandret venstre",
  lateral_right: "Vandret højre",
  down_left: "Ned til venstre",
  down_right: "Ned til højre",
  defocused: "Defokuseret",
  unspecified: "Uspecificeret",
};
export const EYE_ACCESS_LABEL: Record<(typeof ACCESSED)[number], string> = {
  Vr: "Visuelt husket",
  Vc: "Visuelt konstrueret",
  Ar: "Auditivt husket",
  Ac: "Auditivt konstrueret",
  K: "Kinæstetisk",
  Ad: "Indre dialog",
  unknown: "Ukendt",
};

export const eyeAccessingCuesCategory = defineCategory({
  key: "eye_accessing_cues",
  title: "Eye Accessing Cues",
  description: "Øjenbevægelser som spor af indre repræsentationer — kun når de faktisk kan observeres.",
  icon: "scan-eye",
  instructions: `Eye accessing cues kan IKKE observeres i ren tekst. Vær ærlig om grundlaget:
- basis = observed_annotations KUN hvis transskriptet indeholder nonverbale annoteringer (fx "[kigger op til venstre]"). Registrér da hver cue med retning (set fra personens eget perspektiv), sandsynligt tilgået system (Vr, Vc, Ar, Ac, K, Ad), kontekst og citat.
- basis = inferred_from_language hvis du kun kan forudsige sandsynlige cues ud fra prædikater; markér alle cues med lav sikkerhed og forklar det i caveat.
- basis = not_available hvis intet af ovenstående; returnér tom cues-liste.
- Opfind aldrig observationer. observation_suggestions: hvad man konkret bør observere i en videooptagelse eller næste session.`,
  schema: z.object({
    basis: z.enum(BASIS),
    cues: z.array(
      z.object({
        direction: z.enum(DIRECTIONS),
        accessed_system: z.enum(ACCESSED),
        context: z.string().describe("Hvad personen talte om/blev spurgt om"),
        quote: z.string().describe("Ordret citat eller annotering, eller tom streng"),
        confidence: Confidence,
      }),
    ),
    caveat: z.string().describe("Forbehold om grundlaget"),
    observation_suggestions: z.array(z.string()),
  }),
  count: (d) => d.cues.length,
  metrics: (d) => ({ cues: d.cues.length, observed: d.basis === "observed_annotations" ? 1 : 0 }),
  toReport: (d) => [
    {
      type: "callout",
      tone: d.basis === "observed_annotations" ? "info" : "warning",
      title: EYE_BASIS_LABEL[d.basis],
      text: d.caveat || "—",
    },
    ...(d.cues.length
      ? [
          {
            type: "table" as const,
            headers: ["Retning", "System", "Kontekst", "Sikkerhed"],
            rows: d.cues.map((c) => [
              EYE_DIRECTION_LABEL[c.direction],
              EYE_ACCESS_LABEL[c.accessed_system],
              nonEmpty(c.quote) ? `${c.context} — “${c.quote}”` : c.context,
              CONFIDENCE_LABEL[c.confidence],
            ]),
          },
        ]
      : []),
    ...(d.observation_suggestions.length
      ? [
          { type: "subheading" as const, text: "Observér næste gang" },
          { type: "bullets" as const, items: d.observation_suggestions },
        ]
      : []),
  ],
});
