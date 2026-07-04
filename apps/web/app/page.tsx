"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

/** Render **bold** markers from agent output as accent-colored strong text. */
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

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  const send = useCallback(async () => {
    const text = input.trim();
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
    }
  }, [input, busy, sessionId]);

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
        <div className="emotion-chip">
          {emotion ? (
            <>
              <span>tilstand: {emotion.primaryEmotion}</span>
              <span>stress {Math.round(emotion.stress * 100)}%</span>
              <span>energi {Math.round(emotion.energy * 100)}%</span>
              <span>klarhed {Math.round(emotion.clarity * 100)}%</span>
            </>
          ) : (
            <span>SYNAPSE lytter med på tone, energi og mønstre</span>
          )}
        </div>
        {sessionId ? (
          <button className="btn btn-ghost" onClick={endSession} disabled={busy}>
            Afslut session
          </button>
        ) : null}
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="empty-state" style={{ marginTop: "18vh" }}>
            <h1>Hvad fylder lige nu?</h1>
            <p>
              SYNAPSE er ikke en chatbot. Den spørger, udfordrer og genkender
              dine mønstre — og hjælper dig med at handle på dem.
            </p>
          </div>
        ) : (
          <div className="chat-column">
            {messages.map((message, i) => (
              <div
                key={i}
                className={`msg ${message.role === "user" ? "msg-user" : "msg-assistant"}`}
              >
                <div className="msg-meta">
                  {message.role === "user"
                    ? "Dig"
                    : `SYNAPSE${message.agent ? ` · ${message.agent}` : ""}`}
                </div>
                <div className="msg-body">{renderContent(message.content)}</div>
              </div>
            ))}
            {busy ? (
              <div className="msg msg-assistant">
                <div className="msg-meta">SYNAPSE</div>
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
          <button
            className="btn btn-primary"
            onClick={() => void send()}
            disabled={busy || input.trim().length === 0}
          >
            Send
          </button>
        </div>
      </div>
    </>
  );
}
