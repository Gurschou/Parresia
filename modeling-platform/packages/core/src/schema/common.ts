import { z } from "zod";

/**
 * Fælles byggesten for alle kategori-schemaer.
 *
 * Regler for structured outputs (Claude `output_config.format`):
 *  - ALLE felter er required (højst 24 valgfrie felter pr. request er tilladt).
 *  - Ingen `.nullable()` / unions (højst 16 pr. request). Brug tom streng,
 *    tom liste eller en "unknown"-enum-værdi i stedet.
 *  - `min`/`max` sendes ikke til API'et, men håndhæves lokalt efter svaret
 *    (se `analyzer/coerce.ts`).
 *  - Enum-værdier er maskinlæsbare (engelske koder); danske labels ligger i
 *    `labels.ts`, så UI og rapport altid viser dansk.
 */

export const Confidence = z
  .enum(["low", "medium", "high"])
  .describe(
    "Sikkerhed: low = svagt/enkeltstående belæg, medium = rimeligt belæg, high = stærkt og gentaget belæg i transskriptet",
  );
export type Confidence = z.infer<typeof Confidence>;

export const EvidenceType = z
  .enum(["quote", "behavior", "inference"])
  .describe(
    "quote = personens egne ord, behavior = konkret beskrevet handling, inference = din fortolkning mellem linjerne",
  );
export type EvidenceType = z.infer<typeof EvidenceType>;

export const Quotes = z
  .array(z.string())
  .describe(
    "Ordrette citater fra transskriptet, kopieret præcist i originalsproget (ingen omskrivning). Tom liste hvis der ikke er direkte belæg.",
  );

/** Felter der gør et fund efterprøveligt. Spreades ind i item-schemaer. */
export const evidenceFields = {
  quotes: Quotes,
  evidence_type: EvidenceType,
  confidence: Confidence,
};

export const RepSystem = z
  .enum(["V", "A", "K", "O", "G", "Ad"])
  .describe(
    "Repræsentationssystem: V=visuelt, A=auditivt (toner/lyde), K=kinæstetisk (følelser/krop), O=olfaktorisk (lugt), G=gustatorisk (smag), Ad=auditivt digitalt (indre dialog, logik, ord)",
  );
export type RepSystem = z.infer<typeof RepSystem>;
export const REP_SYSTEMS = RepSystem.options;

export const Priority = z.enum(["high", "medium", "low"]);
export type Priority = z.infer<typeof Priority>;

export const HUMAN_NEEDS = [
  "certainty",
  "variety",
  "significance",
  "love_connection",
  "growth",
  "contribution",
] as const;
export const HumanNeedKey = z.enum(HUMAN_NEEDS);
export type HumanNeedKey = z.infer<typeof HumanNeedKey>;
