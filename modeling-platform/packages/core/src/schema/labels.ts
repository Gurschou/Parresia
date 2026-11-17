import type { Badge, Tone } from "../report/blocks";
import type { Confidence, EvidenceType, HumanNeedKey, Priority, RepSystem } from "./common";

/** Danske labels for alle maskinlæsbare enum-værdier. */

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  low: "Lav sikkerhed",
  medium: "Middel sikkerhed",
  high: "Høj sikkerhed",
};

export const EVIDENCE_LABEL: Record<EvidenceType, string> = {
  quote: "Citat",
  behavior: "Adfærd",
  inference: "Inferens",
};

export const REP_SYSTEM_LABEL: Record<RepSystem, string> = {
  V: "Visuelt",
  A: "Auditivt",
  K: "Kinæstetisk",
  O: "Olfaktorisk",
  G: "Gustatorisk",
  Ad: "Auditivt digitalt",
};

export const HUMAN_NEED_LABEL: Record<HumanNeedKey, string> = {
  certainty: "Sikkerhed",
  variety: "Variation",
  significance: "Betydning",
  love_connection: "Kærlighed & forbindelse",
  growth: "Vækst",
  contribution: "Bidrag",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: "Høj prioritet",
  medium: "Middel prioritet",
  low: "Lav prioritet",
};

const CONFIDENCE_TONE: Record<Confidence, Tone> = {
  low: "warning",
  medium: "neutral",
  high: "positive",
};

export function evidenceBadges(e: { evidence_type: EvidenceType; confidence: Confidence }): Badge[] {
  return [
    { text: EVIDENCE_LABEL[e.evidence_type], tone: e.evidence_type === "inference" ? "info" : "neutral" },
    { text: CONFIDENCE_LABEL[e.confidence], tone: CONFIDENCE_TONE[e.confidence] },
  ];
}

export function nonEmpty(s: string | undefined | null): s is string {
  return typeof s === "string" && s.trim().length > 0;
}
