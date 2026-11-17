import { z } from "zod";
import { REP_SYSTEMS, RepSystem } from "../schema/common";
import { REP_SYSTEM_LABEL } from "../schema/labels";
import { defineCategory } from "./types";

const pct = z.number().min(0).max(100);

const distributionShape = Object.fromEntries(REP_SYSTEMS.map((s) => [s, pct])) as Record<
  RepSystem,
  typeof pct
>;

export type VakogDistribution = Record<RepSystem, number>;

/** Normaliserer en fordeling så den summerer til 100 (afrundet til 1 decimal). */
export function normalizeDistribution(d: VakogDistribution): VakogDistribution {
  const total = REP_SYSTEMS.reduce((a, s) => a + Math.max(0, d[s] ?? 0), 0);
  if (total <= 0) return Object.fromEntries(REP_SYSTEMS.map((s) => [s, 0])) as VakogDistribution;
  return Object.fromEntries(
    REP_SYSTEMS.map((s) => [s, Math.round((Math.max(0, d[s]) / total) * 1000) / 10]),
  ) as VakogDistribution;
}

export const vakogCategory = defineCategory({
  key: "vakog",
  title: "VAKOG",
  description: "Foretrukne repræsentationssystemer, afsløret gennem sansebaserede prædikater.",
  icon: "eye",
  instructions: `Analysér repræsentationssystemerne (VAKOG + Ad) ud fra sansebaserede prædikater og beskrivelser.
- distribution: procentvis fordeling over V, A, K, O, G, Ad (summerer til 100).
- primary_system og secondary_system.
- predicates: 5-20 konkrete prædikater/vendinger med system og ordret citat (fx "jeg kan se det for mig" → V, "det føles rigtigt" → K, "jeg siger til mig selv" → Ad).
- interpretation: hvad profilen betyder for, hvordan personen lærer, beslutter og kommunikerer.
- communication_tips: 2-5 konkrete råd til at matche personens sprog.`,
  schema: z.object({
    distribution: z.object(distributionShape).describe("Procentfordeling, summerer til 100"),
    primary_system: RepSystem,
    secondary_system: RepSystem,
    predicates: z.array(
      z.object({
        phrase: z.string().describe("Prædikatet/vendingen"),
        system: RepSystem,
        quote: z.string().describe("Ordret citat hvor det forekommer"),
      }),
    ),
    interpretation: z.string(),
    communication_tips: z.array(z.string()),
  }),
  normalize: (d) => ({ ...d, distribution: normalizeDistribution(d.distribution) }),
  count: (d) => d.predicates.length,
  metrics: (d) => Object.fromEntries(REP_SYSTEMS.map((s) => [`vakog_${s}`, d.distribution[s]])),
  toReport: (d) => [
    {
      type: "keyvalue",
      items: [
        { label: "Primært system", value: `${REP_SYSTEM_LABEL[d.primary_system]} (${d.primary_system})` },
        { label: "Sekundært system", value: `${REP_SYSTEM_LABEL[d.secondary_system]} (${d.secondary_system})` },
      ],
    },
    {
      type: "bars",
      max: 100,
      unit: "%",
      items: REP_SYSTEMS.map((s) => ({
        label: `${REP_SYSTEM_LABEL[s]} (${s})`,
        value: d.distribution[s],
        highlight: s === d.primary_system,
      })),
    },
    { type: "paragraph", text: d.interpretation },
    ...(d.predicates.length
      ? [
          {
            type: "table" as const,
            headers: ["Prædikat", "System", "Citat"],
            rows: d.predicates.map((p) => [p.phrase, p.system, p.quote]),
          },
        ]
      : []),
    ...(d.communication_tips.length
      ? [{ type: "subheading" as const, text: "Sådan matcher du sproget" }, { type: "bullets" as const, items: d.communication_tips }]
      : []),
  ],
});
