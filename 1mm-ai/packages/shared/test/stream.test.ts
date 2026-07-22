import { describe, expect, it } from "vitest";
import { createSseParser, toSseFrame } from "../src/stream";
import type { ChatStreamEvent } from "../src/types";

describe("SSE stream parsing", () => {
  it("round-trips events through frames", () => {
    const events: ChatStreamEvent[] = [
      { type: "message.created", userMessageId: "u1", assistantMessageId: "a1" },
      { type: "delta", text: "Hej " },
      { type: "delta", text: "verden" },
      { type: "done", assistantMessageId: "a1" },
    ];
    const wire = events.map(toSseFrame).join("");
    const parser = createSseParser();
    expect(parser.push(wire)).toEqual(events);
  });

  it("handles frames split across arbitrary chunk boundaries", () => {
    const frame = toSseFrame({ type: "delta", text: "streaming!" });
    const parser = createSseParser();
    const collected: ChatStreamEvent[] = [];
    for (const char of frame) {
      collected.push(...parser.push(char));
    }
    expect(collected).toEqual([{ type: "delta", text: "streaming!" }]);
  });

  it("ignores [DONE] sentinels, comments and malformed JSON", () => {
    const parser = createSseParser();
    const events = parser.push("data: [DONE]\n\n: keep-alive\n\ndata: {not json}\n\n");
    expect(events).toEqual([]);
  });

  it("parses multi-line data fields", () => {
    const parser = createSseParser();
    const payload = JSON.stringify({ type: "delta", text: "x" });
    expect(parser.push(`data: ${payload}\n\n`)).toEqual([{ type: "delta", text: "x" }]);
  });
});
