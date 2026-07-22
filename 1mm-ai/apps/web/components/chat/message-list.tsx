"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessageItem } from "./message-item";
import type { UiMessage } from "./use-chat";

interface MessageListProps {
  messages: UiMessage[];
  streaming: boolean;
  activeTool: string | null;
  error: { message: string; retryable: boolean } | null;
  onRetry(): void;
  onSuggestion(text: string): void;
}

const SUGGESTIONS = [
  "Hjælp mig med at planlægge min dag",
  "Forklar et emne, jeg gerne vil forstå bedre",
  "Giv mig feedback på en idé",
];

export function MessageList({
  messages,
  streaming,
  activeTool,
  error,
  onRetry,
  onSuggestion,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [stickToBottom, setStickToBottom] = useState(true);

  // Auto-scroll only while the user is already near the bottom.
  useEffect(() => {
    const el = containerRef.current;
    if (el && stickToBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, stickToBottom]);

  function onScroll() {
    const el = containerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setStickToBottom(nearBottom);
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15">
          <Sparkles className="h-7 w-7 text-primary" aria-hidden />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Hvad kan jeg hjælpe med?</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Skriv en besked, eller tryk på mikrofonen for at tale.
          </p>
        </div>
        <ul className="flex w-full max-w-md flex-col gap-2">
          {SUGGESTIONS.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => onSuggestion(s)}
                className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-left text-sm text-text-secondary hover:border-primary hover:text-text-primary"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className="flex-1 overflow-y-auto px-4 py-6"
      // Screen readers announce streamed content progressively.
      aria-live="polite"
      aria-busy={streaming}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {messages.map((message) =>
          message.status === "failed" ? null : <MessageItem key={message.id} message={message} />,
        )}

        {activeTool && (
          <p className="flex items-center gap-2 text-sm text-text-secondary" role="status">
            <Wrench className="h-4 w-4 animate-pulse" aria-hidden />
            1MM AI bruger værktøjet {activeTool}…
          </p>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3"
          >
            <p className="text-sm text-danger">{error.message}</p>
            {error.retryable && (
              <Button variant="secondary" size="sm" onClick={onRetry}>
                Prøv igen
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
