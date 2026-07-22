"use client";

import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, Mic } from "lucide-react";
import { cn, formatTime } from "@/lib/utils";
import type { UiMessage } from "./use-chat";

interface MessageItemProps {
  message: UiMessage;
}

export const MessageItem = memo(function MessageItem({ message }: MessageItemProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    } catch {
      // Clipboard may be unavailable – ignore.
    }
  }

  return (
    <div className={cn("group flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "relative max-w-[85%] rounded-2xl px-4 py-2.5 md:max-w-[75%]",
          isUser ? "bg-user-bubble" : "bg-assistant-bubble border border-border",
        )}
      >
        {message.messageType === "transcript" && (
          <span className="mb-1 flex items-center gap-1 text-[11px] text-text-muted">
            <Mic className="h-3 w-3" aria-hidden />
            Stemme
          </span>
        )}

        {message.role === "assistant" ? (
          <div className="chat-markdown text-sm leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            {message.status === "streaming" && (
              <span
                className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-text-secondary align-text-bottom"
                aria-hidden
              />
            )}
          </div>
        ) : (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        )}

        <div className="mt-1 flex items-center gap-2">
          <time className="text-[11px] text-text-muted" dateTime={message.createdAt}>
            {formatTime(message.createdAt)}
          </time>
          {message.role === "assistant" &&
            message.status === "completed" &&
            message.content.length > 0 && (
              <button
                type="button"
                onClick={copy}
                aria-label={copied ? "Kopieret" : "Kopiér svar"}
                className="rounded p-1 text-text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-raised hover:text-text-primary focus-visible:opacity-100"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-success" aria-hidden />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                )}
              </button>
            )}
        </div>
      </div>
    </div>
  );
});
