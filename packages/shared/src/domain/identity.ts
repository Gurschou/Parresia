/**
 * Identity domain model — who the user is and where they are heading.
 * The Identity Engine keeps this profile current and measures alignment
 * between daily behaviour and stated identity.
 */
export interface Goal {
  id: string;
  title: string;
  why: string;
  horizon: "week" | "month" | "quarter" | "year" | "life";
  /** 0..1 progress estimate. */
  progress: number;
  status: "active" | "paused" | "achieved" | "abandoned";
  createdAt: string;
}

export interface Habit {
  id: string;
  title: string;
  cadence: "daily" | "weekly";
  /** Current streak length in cadence units. */
  streak: number;
  status: "building" | "stable" | "slipping";
}

export interface IdentityProfile {
  userId: string;
  name?: string;
  values: string[];
  beliefs: string[];
  /** Limiting beliefs the user is actively working on. */
  limitingBeliefs: string[];
  strengths: string[];
  goals: Goal[];
  habits: Habit[];
  /** The user's own words for their states — used verbatim by the coach. */
  ownVocabulary: string[];
  updatedAt: string;
}
