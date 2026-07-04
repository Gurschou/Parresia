"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

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
  atletRapport: {
    indsigt: string;
    naesteSkridt: string;
    spoergsmaal: string;
  };
}

const OPENING =
  "Hej. Kort snak før din session med din coach — det du siger her, bliver til en briefing, coachen læser inden I ses. Hvordan har kroppen det i dag?";

export default function IntakePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: OPENING },
  ]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy, briefing]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy || briefing) return;
    setInput("");
    setBusy(true);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    try {
      const response = await fetch("/api/synapsex/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message ?? "Ukendt fejl");
      setSessionId(data.sessionId);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply.content },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Noget gik galt: ${error instanceof Error ? error.message : error}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }, [input, busy, sessionId, briefing]);

  const endIntake = useCallback(async () => {
    if (!sessionId || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/synapsex/end", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await response.json();
      if (response.ok && data.briefing) {
        setBriefing(data.briefing);
        setSessionId(null);
      }
    } finally {
      setBusy(false);
    }
  }, [sessionId, busy]);

  return (
    <>
      <div className="chat-header">
        <span className="listening">
          <span className="listening-dot" style={{ background: "#fb923c", boxShadow: "0 0 10px rgba(251,146,60,.8)" }} />
          SynapseX · Intake — samtalen bliver til en briefing, din coach læser
        </span>
        {sessionId && !briefing ? (
          <button className="btn btn-primary" onClick={endIntake} disabled={busy}>
            Afsend briefing til coach
          </button>
        ) : null}
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        <div className="chat-column">
          {messages.map((message, i) => (
            <div
              key={i}
              className={`msg ${message.role === "user" ? "msg-user" : "msg-assistant"}`}
            >
              <div className="msg-meta">
                {message.role === "user" ? (
                  "Dig"
                ) : (
                  <>
                    <span className="avatar-orb avatar-orb-x" />
                    SYNAPSEX
                  </>
                )}
              </div>
              <div className="msg-body">{message.content}</div>
            </div>
          ))}
          {busy ? (
            <div className="msg msg-assistant">
              <div className="msg-meta">
                <span className="avatar-orb avatar-orb-x" />
                SYNAPSEX
              </div>
              <div className="thinking">
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : null}

          {briefing ? (
            <div className="briefing-card" style={{ marginTop: 8 }}>
              <div className="briefing-head">
                <span>
                  DIN RAPPORT — {briefing.athleteName} —{" "}
                  {new Date(briefing.createdAt).toLocaleDateString("da-DK")}
                </span>
                <span className="tag tag-x">briefing sendt til din coach ✓</span>
              </div>

              {briefing.atletRapport.indsigt ? (
                <div className="briefing-section">
                  <div className="briefing-section-title">Din indsigt</div>
                  {briefing.atletRapport.indsigt}
                </div>
              ) : null}

              {briefing.atletRapport.spoergsmaal ? (
                <blockquote className="briefing-quote">
                  {briefing.atletRapport.spoergsmaal}
                </blockquote>
              ) : null}

              {briefing.atletRapport.naesteSkridt ? (
                <div className="briefing-focus">
                  <div className="briefing-section-title">Dit næste skridt</div>
                  {briefing.atletRapport.naesteSkridt}
                </div>
              ) : null}

              <p className="muted" style={{ margin: "16px 0 12px" }}>
                Din coach har fået sin egen version med kerneindsigt, flags og
                anbefalet fokus til jeres session.
              </p>
              <Link href="/briefings" className="btn">
                Se coach-visningen →
              </Link>
            </div>
          ) : null}
        </div>
      </div>

      <div className="composer-wrap">
        <div className="composer composer-x">
          <textarea
            rows={1}
            value={input}
            placeholder={
              briefing ? "Intaken er afsluttet" : "Svar SynapseX…"
            }
            disabled={Boolean(briefing)}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            className="btn btn-primary"
            onClick={() => void send()}
            disabled={busy || Boolean(briefing) || input.trim().length === 0}
          >
            Send
          </button>
        </div>
        <div className="composer-hint">
          Fase A: SynapseX taler med dig · Fase B: samtalen bliver til en
          briefing til din coach
        </div>
      </div>
    </>
  );
}
