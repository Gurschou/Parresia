"use client";

import { Hand, Mic, MicOff, PhoneOff, Radio } from "lucide-react";
import { voiceStatusLabels, type VoiceStatus } from "@1mm/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LiveTranscript } from "./use-voice-session";

interface VoicePanelProps {
  status: VoiceStatus;
  muted: boolean;
  pushToTalk: boolean;
  liveTranscripts: LiveTranscript[];
  errorMessage: string | null;
  onToggleMute(): void;
  onTogglePushToTalk(): void;
  onPttPress(): void;
  onPttRelease(): void;
  onInterrupt(): void;
  onEnd(): void;
}

const statusColor: Record<VoiceStatus, string> = {
  disconnected: "bg-text-muted",
  connecting: "bg-warning",
  listening: "bg-success",
  "user-speaking": "bg-accent",
  thinking: "bg-warning",
  "assistant-speaking": "bg-primary",
  reconnecting: "bg-warning",
  error: "bg-danger",
};

/** Live voice controls + transcript preview shown above the composer. */
export function VoicePanel({
  status,
  muted,
  pushToTalk,
  liveTranscripts,
  errorMessage,
  onToggleMute,
  onTogglePushToTalk,
  onPttPress,
  onPttRelease,
  onInterrupt,
  onEnd,
}: VoicePanelProps) {
  return (
    <section
      aria-label="Stemmesamtale"
      className="border-t border-border bg-surface-raised px-4 py-3"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        {/* Status: color + text + icon, never colour alone. */}
        <div className="flex items-center gap-2" role="status" aria-live="polite">
          <span
            className={cn("h-2.5 w-2.5 rounded-full", statusColor[status])}
            aria-hidden
          />
          <span className="text-sm font-medium">{voiceStatusLabels[status]}</span>
          {muted && (
            <span className="flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs text-text-secondary">
              <MicOff className="h-3 w-3" aria-hidden /> Mikrofon slukket
            </span>
          )}
        </div>

        {errorMessage && (
          <p role="alert" className="text-sm text-danger">
            {errorMessage}
          </p>
        )}

        {/* Live transcripts for both sides. */}
        {liveTranscripts.length > 0 && (
          <div aria-live="polite" className="space-y-1">
            {liveTranscripts.map((t) => (
              <p key={t.role} className="truncate text-sm text-text-secondary">
                <span className="font-medium text-text-primary">
                  {t.role === "user" ? "Dig: " : "1MM AI: "}
                </span>
                {t.text}
              </p>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {pushToTalk ? (
            <Button
              variant="primary"
              size="lg"
              onMouseDown={onPttPress}
              onMouseUp={onPttRelease}
              onMouseLeave={onPttRelease}
              onTouchStart={(e) => {
                e.preventDefault();
                onPttPress();
              }}
              onTouchEnd={onPttRelease}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") onPttPress();
              }}
              onKeyUp={(e) => {
                if (e.key === " " || e.key === "Enter") onPttRelease();
              }}
              aria-label="Hold nede for at tale"
              className="min-h-[48px]"
            >
              <Radio className="h-5 w-5" aria-hidden />
              Hold for at tale
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={onToggleMute}
              aria-pressed={muted}
              aria-label={muted ? "Tænd mikrofonen" : "Sluk mikrofonen"}
              className="min-h-[44px]"
            >
              {muted ? (
                <MicOff className="h-4 w-4" aria-hidden />
              ) : (
                <Mic className="h-4 w-4" aria-hidden />
              )}
              {muted ? "Unmute" : "Mute"}
            </Button>
          )}

          <Button
            variant="ghost"
            onClick={onTogglePushToTalk}
            aria-pressed={pushToTalk}
            className="min-h-[44px]"
          >
            <Hand className="h-4 w-4" aria-hidden />
            Push-to-talk {pushToTalk ? "til" : "fra"}
          </Button>

          {status === "assistant-speaking" && (
            <Button variant="secondary" onClick={onInterrupt} className="min-h-[44px]">
              Afbryd
            </Button>
          )}

          <Button variant="danger" onClick={onEnd} className="ml-auto min-h-[44px]">
            <PhoneOff className="h-4 w-4" aria-hidden />
            Afslut samtale
          </Button>
        </div>
      </div>
    </section>
  );
}
