"use client";

import { useEffect, useState } from "react";

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

function barClass(value: number, invert?: boolean): string {
  const effective = invert ? 100 - value : value;
  if (effective >= 70) return "bar-fill good";
  if (effective < 40) return "bar-fill bad";
  return "bar-fill";
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
          <p className="muted">Henter…</p>
        ) : metrics ? (
          <div className="metric-grid">
            <div className="metric-card hero">
              <div>
                <div className="metric-label">Growth Score</div>
                <div className="metric-value hero-value">
                  {metrics.growthScore}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div className="bar" style={{ height: 6 }}>
                  <div
                    className={barClass(metrics.growthScore)}
                    style={{ width: `${metrics.growthScore}%` }}
                  />
                </div>
              </div>
            </div>
            {METRIC_LABELS.map(({ key, label, invert }) => (
              <div className="metric-card" key={key}>
                <div className="metric-label">{label}</div>
                <div className="metric-value">{metrics[key]}</div>
                <div className="bar">
                  <div
                    className={barClass(metrics[key], invert)}
                    style={{ width: `${metrics[key]}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="section-title">Dine mønstre</div>
        {patterns.length === 0 ? (
          <p className="muted">
            Ingen mønstre endnu. Mønstre opdages efterhånden som du taler med
            SYNAPSE — og hvert mønster forklares med et hvorfor.
          </p>
        ) : (
          patterns.map((pattern) => (
            <div className="pattern-card" key={pattern.id}>
              <div className="pattern-head">
                <span className="pattern-label">{pattern.label}</span>
                <span className="tag">
                  {pattern.category} · {Math.round(pattern.confidence * 100)}% ·
                  set {pattern.occurrences}x
                </span>
              </div>
              <div className="pattern-why">Hvorfor: {pattern.why}</div>
              {pattern.suggestedShift ? (
                <div className="pattern-shift">
                  Skifte: {pattern.suggestedShift}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
