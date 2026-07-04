"use client";

import { useEffect, useRef, useState } from "react";

interface Metrics {
  growthScore: number;
  mentalPerformance: number;
  emotionalPerformance: number;
  decisionQuality: number;
  reflectionScore: number;
  learningVelocity: number;
  identityAlignment: number;
  focus: number;
  energy: number;
  stress: number;
}

interface Pattern {
  id: string;
  label: string;
  category: string;
  why: string;
  suggestedShift?: string;
  confidence: number;
  occurrences: number;
  stage: string;
}

const METRIC_LABELS: { key: keyof Metrics; label: string; invert?: boolean }[] = [
  { key: "mentalPerformance", label: "Mental Performance" },
  { key: "emotionalPerformance", label: "Emotionel Performance" },
  { key: "decisionQuality", label: "Beslutningskvalitet" },
  { key: "reflectionScore", label: "Refleksion" },
  { key: "learningVelocity", label: "Læringshastighed" },
  { key: "identityAlignment", label: "Identitets-alignment" },
  { key: "focus", label: "Fokus" },
  { key: "energy", label: "Energi" },
  { key: "stress", label: "Stress", invert: true },
];

const CATEGORY_DA: Record<string, string> = {
  "self-sabotage": "selvsabotage",
  stress: "stress",
  emotional: "emotionelt",
  decision: "beslutning",
  habit: "vane",
  bias: "bias",
  relational: "relationelt",
};

function barClass(value: number, invert?: boolean): string {
  const effective = invert ? 100 - value : value;
  if (effective >= 70) return "bar-fill good";
  if (effective < 40) return "bar-fill bad";
  return "bar-fill";
}

/** Animate a number from 0 to its target once it becomes known. */
function useCountUp(target: number | null, durationMs = 900): number {
  const [value, setValue] = useState(0);
  const frame = useRef<number | null>(null);
  useEffect(() => {
    if (target === null) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [target, durationMs]);
  return value;
}

function GrowthRing({ score }: { score: number }) {
  const displayed = useCountUp(score, 1200);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setProgress(score));
    return () => cancelAnimationFrame(id);
  }, [score]);
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="ring-wrap">
      <svg width="148" height="148" viewBox="0 0 148 148">
        <defs>
          <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="50%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <circle
          className="ring-track"
          cx="74"
          cy="74"
          r={radius}
          fill="none"
          strokeWidth="9"
        />
        <circle
          className="ring-value"
          cx="74"
          cy="74"
          r={radius}
          fill="none"
          strokeWidth="9"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress / 100)}
        />
      </svg>
      <div className="ring-center">
        <span className="ring-number gradient-text">{displayed}</span>
        <span className="ring-label">Growth Score</span>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  invert,
  index,
}: {
  label: string;
  value: number;
  invert?: boolean;
  index: number;
}) {
  const displayed = useCountUp(value);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setWidth(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return (
    <div className="metric-card" style={{ animationDelay: `${index * 45}ms` }}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{displayed}</div>
      <div className="bar">
        <div className={barClass(value, invert)} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [metricsRes, patternsRes] = await Promise.all([
          fetch("/api/metrics"),
          fetch("/api/patterns"),
        ]);
        const metricsData = await metricsRes.json();
        const patternsData = await patternsRes.json();
        setMetrics(metricsData.metrics);
        setPatterns(patternsData.patterns ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="page">
      <div className="page-inner">
        <h1>Dashboard</h1>
        <p className="page-sub">
          Din udvikling, målt på tværs af samtaler, mønstre og refleksioner.
        </p>

        {loading ? (
          <>
            <div className="skeleton" style={{ height: 216, marginBottom: 18 }} />
            <div className="metric-grid">
              {Array.from({ length: 6 }, (_, i) => (
                <div className="skeleton" key={i} style={{ height: 118 }} />
              ))}
            </div>
          </>
        ) : metrics ? (
          <>
            <div className="hero-card">
              <GrowthRing score={metrics.growthScore} />
              <div className="hero-copy">
                <h2>Din samlede udvikling</h2>
                <p>
                  Growth Score vægter mental og emotionel performance,
                  beslutningskvalitet, refleksion, læringshastighed og
                  identitets-alignment. Den stiger, når du arbejder med dine
                  mønstre — ikke når du blot taler om dem.
                </p>
              </div>
            </div>
            <div className="metric-grid">
              {METRIC_LABELS.map(({ key, label, invert }, index) => (
                <MetricCard
                  key={key}
                  label={label}
                  value={metrics[key]}
                  invert={invert}
                  index={index}
                />
              ))}
            </div>
          </>
        ) : null}

        <div className="section-title">Dine mønstre</div>
        {loading ? (
          <div className="skeleton" style={{ height: 96 }} />
        ) : patterns.length === 0 ? (
          <p className="muted">
            Ingen mønstre endnu. Mønstre opdages efterhånden som du taler med
            SYNAPSE — og hvert mønster forklares med et hvorfor.
          </p>
        ) : (
          patterns.map((pattern, index) => (
            <div
              className="pattern-card"
              key={pattern.id}
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <div className="pattern-head">
                <span className="pattern-label">{pattern.label}</span>
                <span className="tag">
                  {CATEGORY_DA[pattern.category] ?? pattern.category} ·{" "}
                  {Math.round(pattern.confidence * 100)}% · set{" "}
                  {pattern.occurrences}x
                </span>
              </div>
              <div className="pattern-why">
                <b>Hvorfor:</b> {pattern.why}
              </div>
              {pattern.suggestedShift ? (
                <div className="pattern-shift">
                  <b>Skifte:</b> {pattern.suggestedShift}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
