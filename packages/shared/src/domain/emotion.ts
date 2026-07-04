/**
 * Emotional Intelligence domain model.
 *
 * Emotions are modelled dimensionally (valence/arousal) plus discrete
 * signals SYNAPSE tracks over time. Every value is 0..1 unless noted.
 */
export type PrimaryEmotion =
  | "joy"
  | "sadness"
  | "anger"
  | "fear"
  | "surprise"
  | "disgust"
  | "trust"
  | "anticipation"
  | "neutral";

export interface EmotionalSnapshot {
  id: string;
  userId: string;
  sessionId: string;
  capturedAt: string;
  primaryEmotion: PrimaryEmotion;
  /** -1 (very negative) .. 1 (very positive). */
  valence: number;
  /** 0 (calm) .. 1 (activated). */
  arousal: number;
  stress: number;
  energy: number;
  motivation: number;
  resistance: number;
  uncertainty: number;
  optimism: number;
  confusion: number;
  clarity: number;
  /** Model's short explanation of what it observed in the text. */
  rationale: string;
}

/** Rolling emotional state aggregated across snapshots. */
export interface EmotionalTrend {
  userId: string;
  windowDays: number;
  averageValence: number;
  averageStress: number;
  averageEnergy: number;
  averageClarity: number;
  dominantEmotions: PrimaryEmotion[];
}
