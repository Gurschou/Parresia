/**
 * Decision Intelligence Engine.
 *
 * Produces a complete DecisionAnalysis for a decision question:
 * signal → patterns → root cause → human needs → trade-offs → blind spots →
 * second/third-order consequences per option → risk/opportunity →
 * recommended actions → confidence → alternative paths → one reflection
 * question.
 */
import {
  err,
  newId,
  nowIso,
  ok,
  type DecisionAnalysis,
  type DecisionOption,
  type EventBus,
  type RecommendedAction,
  type Result,
} from "@synapse/shared";
import { parseModelJson, type ModelRouter } from "@synapse/ai";

interface RawOption {
  label?: string;
  summary?: string;
  consequences?: {
    firstOrder?: string;
    secondOrder?: string;
    thirdOrder?: string;
  };
  risk?: string;
  opportunity?: string;
  alignment?: number;
}

interface RawAnalysis {
  signal?: string;
  patterns?: string[];
  rootCause?: string;
  humanNeeds?: string[];
  tradeOffs?: string[];
  blindSpots?: string[];
  options?: RawOption[];
  recommendedActions?: {
    action?: string;
    rationale?: string;
    timeframe?: string;
  }[];
  confidenceScore?: number;
  alternativePaths?: string[];
  reflectionQuestion?: string;
}

const TIMEFRAMES = ["now", "this-week", "this-month", "long-term"] as const;

const clamp01 = (n: unknown, fallback: number): number =>
  typeof n === "number" && Number.isFinite(n)
    ? Math.min(Math.max(n, 0), 1)
    : fallback;

export class DecisionEngine {
  constructor(
    private readonly router: ModelRouter,
    private readonly events?: EventBus,
  ) {}

  async analyze(input: {
    userId: string;
    question: string;
    /** Memory context, known patterns, values — anything relevant. */
    context?: string;
  }): Promise<Result<DecisionAnalysis>> {
    const completion = await this.router.complete({
      task: "decision-analysis",
      json: true,
      temperature: 0.2,
      maxTokens: 3000,
      messages: [
        {
          role: "system",
          content:
            "Du er SYNAPSEs beslutningsmotor. Lav en komplet beslutningsanalyse og returnér KUN gyldig JSON:\n" +
            '{"signal": "hvad der egentlig spørges om", "patterns": ["relevante mønstre fra brugerens historik"], ' +
            '"rootCause": "den underliggende årsag til dilemmaet", "humanNeeds": ["behov i spil"], ' +
            '"tradeOffs": ["hvad der byttes mod hvad"], "blindSpots": ["hvad brugeren sandsynligvis overser"], ' +
            '"options": [{"label": "…", "summary": "…", "consequences": {"firstOrder": "…", "secondOrder": "…", "thirdOrder": "…"}, ' +
            '"risk": "…", "opportunity": "…", "alignment": 0.0-1.0}], ' +
            '"recommendedActions": [{"action": "…", "rationale": "…", "timeframe": "now|this-week|this-month|long-term"}], ' +
            '"confidenceScore": 0.0-1.0, "alternativePaths": ["veje brugeren ikke har overvejet"], ' +
            '"reflectionQuestion": "ét stærkt spørgsmål"}\n' +
            "Vær konkret og ærlig. Brug brugerens kontekst hvis givet." +
            (input.context ? `\n\nBRUGERKONTEKST:\n${input.context}` : ""),
        },
        { role: "user", content: input.question },
      ],
    });
    if (!completion.ok) return completion;
    const parsed = parseModelJson<RawAnalysis>(completion.value.content);
    if (!parsed.ok) return err(parsed.error);
    const raw = parsed.value;

    const options: DecisionOption[] = (raw.options ?? [])
      .filter((o) => o?.label)
      .map((o) => ({
        label: o.label ?? "",
        summary: o.summary ?? "",
        consequences: {
          firstOrder: o.consequences?.firstOrder ?? "",
          secondOrder: o.consequences?.secondOrder ?? "",
          thirdOrder: o.consequences?.thirdOrder ?? "",
        },
        risk: o.risk ?? "",
        opportunity: o.opportunity ?? "",
        alignment: clamp01(o.alignment, 0.5),
      }));

    const recommendedActions: RecommendedAction[] = (raw.recommendedActions ?? [])
      .filter((a) => a?.action)
      .map((a) => ({
        action: a.action ?? "",
        rationale: a.rationale ?? "",
        timeframe: TIMEFRAMES.includes(a.timeframe as (typeof TIMEFRAMES)[number])
          ? (a.timeframe as RecommendedAction["timeframe"])
          : "this-week",
      }));

    const analysis: DecisionAnalysis = {
      id: newId("dec"),
      userId: input.userId,
      createdAt: nowIso(),
      question: input.question,
      signal: raw.signal ?? "",
      patterns: raw.patterns ?? [],
      rootCause: raw.rootCause ?? "",
      humanNeeds: raw.humanNeeds ?? [],
      tradeOffs: raw.tradeOffs ?? [],
      blindSpots: raw.blindSpots ?? [],
      options,
      recommendedActions,
      confidenceScore: clamp01(raw.confidenceScore, 0.5),
      alternativePaths: raw.alternativePaths ?? [],
      reflectionQuestion: raw.reflectionQuestion ?? "",
    };
    await this.events?.publish("decision.analyzed", {
      userId: input.userId,
      analysis,
    });
    return ok(analysis);
  }
}
