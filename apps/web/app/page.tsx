"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MicButton } from "./components/mic-button";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  agent?: string;
}

interface EmotionSummary {
  primaryEmotion: string;
  stress: number;
  energy: number;
  clarity: number;
}

const SUGGESTIONS = [
  {
    label: "Mønster",
    text: "Jeg udskyder en svær samtale med min chef – igen. Hvorfor gør jeg det?",
  },
  {
    label: "Beslutning",
    text: "Skal jeg sige ja til det nye job, eller blive hvor jeg er?",
  },
  {
    label: "Klarhed",
    text: "Jeg føler mig overvældet og ved ikke, hvor jeg skal starte.",
  },
  {
    label: "Refleksion",
    text: "Hvad har mine sidste uger egentlig handlet om?",
  },
];

const EMOTION_DA: Record<string, string> = {
  joy: "glæde",
  sadness: "tristhed",
  anger: "vrede",
  fear: "frygt",
  surprise: "overraskelse",
  disgust: "afsky",
  trust: "tillid",
  anticipation: "forventning",
  neutral: "neutral",
};

function signalColor(value: number, invert = false): string {
  const v = invert ? 1 - value : value;
  if (v >= 0.65) return "var(--positive)";
  if (v < 0.4) return "var(--negative)";
  return "var(--warning)";
}

/** Render **bold** markers from agent output as gradient strong text. */
function renderContent(content: string) {
  const parts = content.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [emotion, setEmotion] = useState<EmotionSummary | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  const send = useCallback(
    async (override?: string) => {
      const text = (override ?? input).trim();
      if (!text || busy) return;
      setInput("");
      setBusy(true);
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId, message: text }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error?.message ?? "Ukendt fejl");
        }
        setSessionId(data.sessionId);
        if (data.emotion) setEmotion(data.emotion);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.reply.content,
            agent: data.reply.agent,
          },
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
        textareaRef.current?.focus();
      }
    },
    [input, busy, sessionId],
  );

  const endSession = useCallback(async () => {
    if (!sessionId || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/session/end", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await response.json();
      if (response.ok && data.reflection) {
        const r = data.reflection;
        const lines = [
          r.summary,
          r.insights?.length
            ? `**Indsigter:**\n${r.insights.map((i: string) => `- ${i}`).join("\n")}`
            : "",
          r.commitments?.length
            ? `**Commitments:**\n${r.commitments
                .map((c: { action: string }) => `- ${c.action}`)
                .join("\n")}`
            : "",
          r.carryForwardQuestion
            ? `**Tag med dig:** ${r.carryForwardQuestion}`
            : "",
        ].filter(Boolean);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: lines.join("\n\n"), agent: "reflection" },
        ]);
      }
    } finally {
      setSessionId(null);
      setEmotion(null);
      setBusy(false);
    }
  }, [sessionId, busy]);

  return (
    <>
      <div className="chat-header">
        {emotion ? (
          <div className="emotion-chips">
            <span className="chip">
              <span
                className="chip-dot"
                style={{ background: "var(--accent)" }}
              />
              {EMOTION_DA[emotion.primaryEmotion] ?? emotion.primaryEmotion}
            </span>
            <span className="chip">
              <span
                className="chip-dot"
                style={{ background: signalColor(emotion.stress, true) }}
              />
              stress <strong>{Math.round(emotion.stress * 100)}%</strong>
            </span>
            <span className="chip">
              <span
                className="chip-dot"
                style={{ background: signalColor(emotion.energy) }}
              />
              energi <strong>{Math.round(emotion.energy * 100)}%</strong>
            </span>
            <span className="chip">
              <span
                className="chip-dot"
                style={{ background: signalColor(emotion.clarity) }}
              />
              klarhed <strong>{Math.round(emotion.clarity * 100)}%</strong>
            </span>
          </div>
        ) : (
          <span className="listening">
            <span className="listening-dot" />
            SYNAPSE lytter med på tone, energi og mønstre
          </span>
        )}
        {sessionId ? (
          <button className="btn btn-ghost" onClick={endSession} disabled={busy}>
            Afslut session
          </button>
        ) : null}
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="empty-state" style={{ marginTop: "13vh" }}>
            <div className="empty-kicker">Mental · Emotionel · Beslutning</div>
            <h1>
              Hvad fylder <span className="gradient-text">lige nu?</span>
            </h1>
            <p>
              SYNAPSE er ikke en chatbot. Den spørger, udfordrer og genkender
              dine mønstre — og hjælper dig med at handle på dem.
            </p>
            <div className="suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion.label}
                  className="suggestion"
                  onClick={() => void send(suggestion.text)}
                >
                  <span className="suggestion-label">{suggestion.label}</span>
                  {suggestion.text}
                </button>
              ))}
            </div>
          </div>
        ) : (
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
                      <span className="avatar-orb" />
                      SYNAPSE
                      {message.agent ? (
                        <span className="agent-tag">{message.agent}</span>
                      ) : null}
                    </>
                  )}
                </div>
                <div className="msg-body">{renderContent(message.content)}</div>
              </div>
            ))}
            {busy ? (
              <div className="msg msg-assistant">
                <div className="msg-meta">
                  <span className="avatar-orb" />
                  SYNAPSE
                </div>
                <div className="thinking">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="composer-wrap">
        <div className="composer">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            placeholder="Skriv til SYNAPSE…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <MicButton value={input} onChange={setInput} disabled={busy} />
          <button
            className="btn btn-primary"
            onClick={() => void send()}
            disabled={busy || input.trim().length === 0}
          >
            Send
          </button>
        </div>
        <div className="composer-hint">
          <kbd>Enter</kbd> for at sende · <kbd>Shift</kbd> + <kbd>Enter</kbd>{" "}
          for ny linje · tryk på mikrofonen for at tale
        </div>
      </div>
    </>
  );
}
