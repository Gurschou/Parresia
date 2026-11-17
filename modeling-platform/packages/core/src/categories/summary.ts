import { z } from "zod";
import { defineCategory } from "./types";

export const summaryCategory = defineCategory({
  key: "summary",
  title: "Sammenfatning",
  description: "Hvem der modelleres, hvilket resultat der er værd at kopiere, og de vigtigste indsigter.",
  icon: "sparkles",
  instructions: `Skriv en kort, præcis sammenfatning af modellen.
- subject: hvem der modelleres (navn/rolle hvis det fremgår, ellers "Ukendt person").
- result_modeled: det konkrete resultat eller den kompetence, der er værd at modellere (én sætning).
- overview: 3-5 sætninger om personens mest virksomme mønstre.
- key_insights: 3-6 skarpe indsigter, hver én sætning.
- source_quality: én ærlig sætning om, hvor meget transskriptet faktisk afslører (længde, dybde, om det er selvbeskrivelse eller konkret adfærd).`,
  schema: z.object({
    subject: z.string().describe("Hvem der modelleres"),
    result_modeled: z.string().describe("Det resultat/den kompetence der er værd at modellere"),
    overview: z.string().describe("3-5 sætningers sammenfatning"),
    key_insights: z.array(z.string()).describe("3-6 vigtigste indsigter"),
    source_quality: z.string().describe("Ærlig vurdering af kildegrundlaget"),
  }),
  count: (d) => d.key_insights.length,
  toReport: (d) => [
    {
      type: "keyvalue",
      items: [
        { label: "Model", value: d.subject },
        { label: "Resultat der modelleres", value: d.result_modeled },
      ],
    },
    { type: "paragraph", text: d.overview },
    { type: "subheading", text: "Nøgleindsigter" },
    { type: "bullets", items: d.key_insights },
    { type: "callout", tone: "info", title: "Kildegrundlag", text: d.source_quality },
  ],
});
