/**
 * Pattern Recognition Engine — SYNAPSE's biggest strength.
 *
 * Detects behavioural/emotional/cognitive patterns from conversation, and
 * — critically — explains WHY each pattern exists (detection without
 * understanding does not create transformation). New observations of an
 * existing pattern reinforce it (occurrences + confidence) instead of
 * duplicating it.
 */
import {
  err,
  newId,
  nowIso,
  ok,
  type DetectedPattern,
  type EventBus,
  type PatternCategory,
  type Result,
} from "@synapse/shared";
import { parseModelJson, type ModelRouter } from "@synapse/ai";

const CATEGORIES: PatternCategory[] = [
  "emotional",
  "decision",
  "habit",
  "cognitive-distortion",
  "bias",
  "self-sabotage",
  "stress",
  "motivation",
  "learning-style",
  "communication-style",
  "leadership-style",
  "decision-style",
  "energy",
  "relational",
  "value-conflict",
  "goal-conflict",
  "life-direction",
  "repeated-mistake",
  "hidden-opportunity",
];

interface RawPattern {
  category?: string;
  label?: string;
  evidence?: string[];
  why?: string;
  suggestedShift?: string;
  confidence?: number;
}

export interface PatternRepository {
  listByUser(userId: string): Promise<DetectedPattern[]>;
  save(pattern: DetectedPattern): Promise<void>;
}

export class InMemoryPatternRepository implements PatternRepository {
  private readonly patterns = new Map<string, DetectedPattern>();

  async listByUser(userId: string): Promise<DetectedPattern[]> {
    return [...this.patterns.values()].filter((p) => p.userId === userId);
  }

  async save(pattern: DetectedPattern): Promise<void> {
    this.patterns.set(pattern.id, pattern);
  }
}

const normalizeLabel = (label: string): string =>
  label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export class PatternEngine {
  constructor(
    private readonly router: ModelRouter,
    private readonly repository: PatternRepository,
    private readonly events?: EventBus,
  ) {}

  async listPatterns(userId: string): Promise<DetectedPattern[]> {
    return this.repository.listByUser(userId);
  }

  async detect(input: {
    userId: string;
    transcript: string;
  }): Promise<Result<DetectedPattern[]>> {
    const existing = await this.repository.listByUser(input.userId);
    const completion = await this.router.complete({
      task: "pattern-analysis",
      json: true,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Du er SYNAPSEs mønstergenkendelses-modul. Find adfærds-, følelses- og tankemønstre i samtalen. " +
            "Returnér KUN gyldig JSON: " +
            `{"patterns": [{"category": en af ${CATEGORIES.join("|")}, ` +
            '"label": "kort navn på mønstret", "evidence": ["konkrete citater/observationer"], ' +
            '"why": "hvorfor mønstret sandsynligvis eksisterer — den psykologiske mekanisme", ' +
            '"suggestedShift": "det alternative perspektiv eller adfærd", "confidence": 0.0-1.0}]}. ' +
            "Rapportér kun mønstre med reelt belæg i samtalen. Kendte mønstre for brugeren: " +
            (existing.map((p) => p.label).join("; ") || "ingen endnu") +
            " — genbrug samme label hvis du ser et kendt mønster igen.",
        },
        { role: "user", content: input.transcript },
      ],
    });
    if (!completion.ok) return completion;
    const parsed = parseModelJson<{ patterns?: RawPattern[] }>(
      completion.value.content,
    );
    if (!parsed.ok) return err(parsed.error);

    const byLabel = new Map(
      existing.map((p) => [normalizeLabel(p.label), p] as const),
    );
    const results: DetectedPattern[] = [];
    for (const raw of parsed.value.patterns ?? []) {
      if (!raw?.label || !raw.why) continue;
      const category = CATEGORIES.includes(raw.category as PatternCategory)
        ? (raw.category as PatternCategory)
        : "emotional";
      const known = byLabel.get(normalizeLabel(raw.label));
      const pattern: DetectedPattern = known
        ? {
            ...known,
            evidence: [...known.evidence, ...(raw.evidence ?? [])].slice(-10),
            why: raw.why,
            suggestedShift: raw.suggestedShift ?? known.suggestedShift,
            confidence: Math.min(known.confidence + 0.1, 1),
            occurrences: known.occurrences + 1,
            lastSeenAt: nowIso(),
          }
        : {
            id: newId("pat"),
            userId: input.userId,
            category,
            label: raw.label,
            evidence: raw.evidence ?? [],
            why: raw.why,
            suggestedShift: raw.suggestedShift,
            stage: "detected",
            confidence: Math.min(Math.max(raw.confidence ?? 0.5, 0), 1),
            occurrences: 1,
            firstSeenAt: nowIso(),
            lastSeenAt: nowIso(),
          };
      await this.repository.save(pattern);
      await this.events?.publish("pattern.detected", {
        userId: input.userId,
        pattern,
      });
      results.push(pattern);
    }
    return ok(results);
  }
}
