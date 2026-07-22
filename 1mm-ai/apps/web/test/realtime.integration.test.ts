import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeRequest, registerUser, routeParams, setupTestApp } from "./helpers";
import { resetRateLimits, RATE_LIMITS } from "@/lib/rate-limit";

let close: () => Promise<void>;
let user: { token: string; userId: string };

beforeAll(async () => {
  ({ close } = await setupTestApp());
  user = await registerUser("voice@example.com");
});

afterAll(async () => {
  await close();
});

describe("realtime session endpoint", () => {
  it("mints a short-lived client secret for an authenticated user", async () => {
    const { POST } = await import("@/app/api/realtime/session/route");
    const response = await POST(
      makeRequest("/api/realtime/session", { token: user.token, body: {} }),
      routeParams({}),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      clientSecret: string;
      expiresAt: number;
      model: string;
    };
    // Only the ephemeral secret (ek_…) may reach the client – never sk_.
    expect(body.clientSecret.startsWith("ek_")).toBe(true);
    expect(body.clientSecret.startsWith("sk_")).toBe(false);
    expect(body.expiresAt).toBeGreaterThan(Date.now() / 1000);
    expect(body.model).toBeTruthy();
  });

  it("rejects unauthenticated requests", async () => {
    const { POST } = await import("@/app/api/realtime/session/route");
    const response = await POST(
      makeRequest("/api/realtime/session", { body: {} }),
      routeParams({}),
    );
    expect(response.status).toBe(401);
  });

  it("rate-limits repeated token requests", async () => {
    resetRateLimits();
    const { POST } = await import("@/app/api/realtime/session/route");
    let lastStatus = 200;
    for (let i = 0; i < RATE_LIMITS.realtimeSession.limit + 1; i++) {
      const response = await POST(
        makeRequest("/api/realtime/session", { token: user.token, body: {} }),
        routeParams({}),
      );
      lastStatus = response.status;
    }
    expect(lastStatus).toBe(429);
    resetRateLimits();
  });

  it("saves voice transcripts as messages in an owned conversation", async () => {
    const { POST: createConversation } = await import("@/app/api/conversations/route");
    const conversationResponse = await createConversation(
      makeRequest("/api/conversations", { token: user.token, body: { mode: "voice" } }),
      routeParams({}),
    );
    const { conversation } = (await conversationResponse.json()) as {
      conversation: { id: string };
    };

    const { POST: saveTranscript } = await import("@/app/api/realtime/transcripts/route");
    const saved = await saveTranscript(
      makeRequest("/api/realtime/transcripts", {
        token: user.token,
        body: { conversationId: conversation.id, role: "user", content: "Hej fra stemmen" },
      }),
      routeParams({}),
    );
    expect(saved.status).toBe(201);

    // Another user cannot write into that conversation.
    const intruder = await registerUser("intruder@example.com");
    const blocked = await saveTranscript(
      makeRequest("/api/realtime/transcripts", {
        token: intruder.token,
        body: { conversationId: conversation.id, role: "user", content: "hacked" },
      }),
      routeParams({}),
    );
    expect(blocked.status).toBe(404);
  });
});
