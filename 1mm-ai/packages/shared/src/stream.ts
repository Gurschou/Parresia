import type { ChatStreamEvent } from "./types";

/**
 * Incremental server-sent-events parser for the chat stream.
 * Feed it raw text chunks; it returns fully parsed events and buffers the rest.
 * Works in browsers, React Native (expo/fetch) and Node.
 */
export function createSseParser(): { push(chunk: string): ChatStreamEvent[] } {
  let buffer = "";

  return {
    push(chunk: string): ChatStreamEvent[] {
      buffer += chunk;
      const events: ChatStreamEvent[] = [];
      // SSE messages are separated by a blank line.
      let separatorIndex = buffer.indexOf("\n\n");
      while (separatorIndex !== -1) {
        const rawMessage = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const parsed = parseSseMessage(rawMessage);
        if (parsed) events.push(parsed);
        separatorIndex = buffer.indexOf("\n\n");
      }
      return events;
    },
  };
}

function parseSseMessage(raw: string): ChatStreamEvent | null {
  const dataLines = raw
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
  if (dataLines.length === 0) return null;
  const payload = dataLines.join("\n");
  if (payload === "[DONE]") return null;
  try {
    const event = JSON.parse(payload) as ChatStreamEvent;
    if (typeof event === "object" && event !== null && "type" in event) {
      return event;
    }
    return null;
  } catch {
    // Malformed frame – ignore rather than crash the UI.
    return null;
  }
}

/** Serialize a chat event as an SSE frame (server side). */
export function toSseFrame(event: ChatStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
