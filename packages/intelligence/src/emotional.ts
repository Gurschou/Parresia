/**
 * Emotional Intelligence Engine.
 *
 * Analyzes a piece of user text and produces a structured EmotionalSnapshot
 * (valence/arousal plus the discrete signals SYNAPSE tracks: stress, energy,
 * motivation, resistance, uncertainty, optimism, confusion, clarity).
 * Snapshots are published on the event bus so patterns and growth metrics
 * update reactively.
 */
import {
  err,
  newId,
  nowIso,
  ok,
  type EmotionalSnapshot,
  type EventBus,
  type PrimaryEmotion,
  type Result,
} from "@synapse/shared";
import { parseModelJson, type ModelRouter } from "@synapse/ai";

const PRIMARY_EMOTIONS: PrimaryEmotion[] = [
  "joy",
  "sadness",
  "anger",
  "fear",
  "surprise",
  "disgust",
  "trust",
  "anticipation",
  "neutral",
];

interface RawAnalysis {
  primaryEmotion?: string;
  valence?: number;
  arousal?: number;
  stress?: number;
  energy?: number;
  motivation?: number;
  resistance?: number;
  uncertainty?: number;
  optimism?: number;
  confusion?: number;
  clarity?: number;
  rationale?: string;
}

const clamp = (n: unknown, min: number, max: number, fallback: number): number =>
  typeof n === "number" && Number.isFinite(n)
    ? Math.min(Math.max(n, min), max)
    : fallback;

export class EmotionalEngine {
  constructor(
    private readonly router: ModelRouter,
    private readonly events?: EventBus,
  ) {}

  async analyze(input: {
    userId: string;
    sessionId: string;
    text: string;
  }): Promise<Result<EmotionalSnapshot>> {
    const completion = await this.router.complete({
      task: "emotional-analysis",
      json: true,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Du er SYNAPSEs emotionelle analysemodul. Analysér brugerens tekst og returnér KUN gyldig JSON: " +
            `{"primaryEmotion": en af ${PRIMARY_EMOTIONS.join("|")}, ` +
            '"valence": -1..1, "arousal": 0..1, "stress": 0..1, "energy": 0..1, ' +
            '"motivation": 0..1, "resistance": 0..1, "uncertainty": 0..1, ' +
            '"optimism": 0..1, "confusion": 0..1, "clarity": 0..1, ' +
            '"rationale": "én kort sætning om hvad du observerede"}. ' +
            "Vurdér ud fra ordvalg, tempo og indhold — ikke gæt ud over teksten.",
        },
        { role: "user", content: input.text },
      ],
    });
    if (!completion.ok) return completion;
    const parsed = parseModelJson<RawAnalysis>(completion.value.content);
    if (!parsed.ok) return err(parsed.error);
    const raw = parsed.value;
    const snapshot: EmotionalSnapshot = {
      id: newId("emo"),
      userId: input.userId,
      sessionId: input.sessionId,
      capturedAt: nowIso(),
      primaryEmotion: PRIMARY_EMOTIONS.includes(raw.primaryEmotion as PrimaryEmotion)
        ? (raw.primaryEmotion as PrimaryEmotion)
        : "neutral",
      valence: clamp(raw.valence, -1, 1, 0),
      arousal: clamp(raw.arousal, 0, 1, 0.5),
      stress: clamp(raw.stress, 0, 1, 0.3),
      energy: clamp(raw.energy, 0, 1, 0.5),
      motivation: clamp(raw.motivation, 0, 1, 0.5),
      resistance: clamp(raw.resistance, 0, 1, 0.2),
      uncertainty: clamp(raw.uncertainty, 0, 1, 0.3),
      optimism: clamp(raw.optimism, 0, 1, 0.5),
      confusion: clamp(raw.confusion, 0, 1, 0.2),
      clarity: clamp(raw.clarity, 0, 1, 0.5),
      rationale: typeof raw.rationale === "string" ? raw.rationale : "",
    };
    await this.events?.publish("emotion.analyzed", {
      userId: input.userId,
      snapshot,
    });
    return ok(snapshot);
  }
}
