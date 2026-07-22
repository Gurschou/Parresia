"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Mic, Send, Square } from "lucide-react";
import { LIMITS } from "@1mm/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ComposerProps {
  disabled: boolean;
  streaming: boolean;
  voiceActive: boolean;
  onSend(text: string): void;
  onStop(): void;
  onToggleVoice(): void;
}

export function Composer({
  disabled,
  streaming,
  voiceActive,
  onSend,
  onStop,
  onToggleVoice,
}: ComposerProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const value = text.trim();
    if (!value || streaming || disabled) return;
    onSend(value);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={submit} className="border-t border-border bg-surface p-3 md:p-4">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <label htmlFor="chat-input" className="sr-only">
          Skriv en besked til 1MM AI
        </label>
        <textarea
          id="chat-input"
          ref={textareaRef}
          value={text}
          disabled={disabled}
          maxLength={LIMITS.maxMessageLength}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
          }}
          onKeyDown={onKeyDown}
          placeholder="Skriv til 1MM AI…"
          rows={1}
          className={cn(
            "min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-background px-4 py-2.5",
            "text-sm text-text-primary placeholder:text-text-muted focus:border-primary",
            "disabled:opacity-50",
          )}
        />
        <Button
          type="button"
          variant={voiceActive ? "danger" : "secondary"}
          size="icon"
          onClick={onToggleVoice}
          aria-label={voiceActive ? "Afslut stemmesamtale" : "Start stemmesamtale"}
          aria-pressed={voiceActive}
          className="min-h-[44px] min-w-[44px]"
        >
          <Mic className="h-5 w-5" aria-hidden />
        </Button>
        {streaming ? (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={onStop}
            aria-label="Stop generering"
            className="min-h-[44px] min-w-[44px]"
          >
            <Square className="h-4 w-4" aria-hidden />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            disabled={disabled || text.trim().length === 0}
            aria-label="Send besked"
            className="min-h-[44px] min-w-[44px]"
          >
            <Send className="h-5 w-5" aria-hidden />
          </Button>
        )}
      </div>
    </form>
  );
}
