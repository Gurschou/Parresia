"use client";

import { useEffect, useState } from "react";

interface BriefingFlag {
  type: string;
  sikkerhed: string;
  belaeg: string;
}

interface Briefing {
  id: string;
  athleteName: string;
  createdAt: string;
  kerneindsigt: string;
  fysiskTilstand: string;
  mentaltFokus: string;
  flags: BriefingFlag[];
  citat: string;
  anbefaletFokus: string;
  akut: boolean;
}

const CONFIDENCE_COLOR: Record<string, string> = {
  lav: "var(--text-faint)",
  mellem: "var(--warning)",
  høj: "var(--negative)",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="briefing-section">
      <div className="briefing-section-title">{title}</div>
      <div>{children}</div>
    </div>
  );
}

export default function BriefingsPage() {
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/synapsex/briefings");
        const data = await response.json();
        setBriefings(data.briefings ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="page">
      <div className="page-inner" style={{ maxWidth: 780 }}>
        <h1>Coach-briefings</h1>
        <p className="page-sub">
          SynapseX omsætter atletens intake til en briefing, du kan læse på to
          minutter — kerneindsigt, flags, ét citat og én anbefalet retning.
        </p>

        {loading ? (
          <div className="skeleton" style={{ height: 260 }} />
        ) : briefings.length === 0 ? (
          <p className="muted">
            Ingen briefings endnu. De oprettes, når en atlet afslutter en
            intake-samtale med SynapseX.
          </p>
        ) : (
          briefings.map((briefing, index) => (
            <div
              className={`briefing-card${briefing.akut ? " briefing-akut" : ""}`}
              key={briefing.id}
              style={{ animationDelay: `${index * 60}ms` }}
            >
              {briefing.akut ? (
                <div className="akut-banner">
                  AKUT — kontakt atleten direkte før sessionen
                </div>
              ) : null}
              <div className="briefing-head">
                <span>
                  BRIEFING — {briefing.athleteName} —{" "}
                  {new Date(briefing.createdAt).toLocaleDateString("da-DK", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>

              <Section title="Kerneindsigt">{briefing.kerneindsigt}</Section>
              {briefing.fysiskTilstand ? (
                <Section title="Fysisk tilstand">{briefing.fysiskTilstand}</Section>
              ) : null}
              {briefing.mentaltFokus ? (
                <Section title="Mentalt fokus">{briefing.mentaltFokus}</Section>
              ) : null}

              {briefing.flags.length > 0 ? (
                <Section title="Flags">
                  {briefing.flags.map((flag, i) => (
                    <div className="flag-row" key={i}>
                      <span
                        className="flag-dot"
                        style={{
                          background:
                            flag.type === "akut"
                              ? "var(--negative)"
                              : CONFIDENCE_COLOR[flag.sikkerhed] ??
                                "var(--text-faint)",
                        }}
                      />
                      <span className="flag-type">{flag.type}</span>
                      <span className="flag-confidence">{flag.sikkerhed}</span>
                      <span className="flag-evidence">{flag.belaeg}</span>
                    </div>
                  ))}
                </Section>
              ) : null}

              {briefing.citat ? (
                <blockquote className="briefing-quote">
                  “{briefing.citat}”
                </blockquote>
              ) : null}

              <div className="briefing-focus">
                <div className="briefing-section-title">
                  Anbefalet fokus for sessionen
                </div>
                {briefing.anbefaletFokus}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
