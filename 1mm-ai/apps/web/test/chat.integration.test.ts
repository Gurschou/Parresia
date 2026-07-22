import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { messages, type Database } from "@1mm/database";
import { makeRequest, readSse, registerUser, routeParams, setupTestApp } from "./helpers";

let db: Database;
let close: () => Promise<void>;
let alice: { token: string; userId: string };
let bob: { token: string; userId: string };

beforeAll(async () => {
  ({ db, close } = await setupTestApp());
  alice = await registerUser("alice@example.com");
  bob = await registerUser("bob@example.com");
});

afterAll(async () => {
  await close();
});

describe("chat", () => {
  it("streams an answer and persists both messages", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const response = await POST(
      makeRequest("/api/chat", { token: alice.token, body: { message: "Hej 1MM AI!" } }),
      routeParams({}),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const events = await readSse(response);
    const created = events.find((e) => e.type === "message.created");
    expect(created).toBeDefined();
    const deltas = events.filter((e) => e.type === "delta");
    expect(deltas.length).toBeGreaterThan(1);
    expect(events.at(-1)?.type).toBe("done");

    if (created?.type !== "message.created") throw new Error("unreachable");
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, created.conversationId));
    expect(rows).toHaveLength(2);
    const assistant = rows.find((r) => r.role === "assistant");
    expect(assistant?.status).toBe("completed");
    expect(assistant?.content).toContain("Hej 1MM AI!");
  });

  it("lists only the current user's conversations", async () => {
    const { GET } = await import("@/app/api/conversations/route");
    const aliceList = (await (
      await GET(makeRequest("/api/conversations", { token: alice.token }), routeParams({}))
    ).json()) as { conversations: { id: string }[] };
    const bobList = (await (
      await GET(makeRequest("/api/conversations", { token: bob.token }), routeParams({}))
    ).json()) as { conversations: { id: string }[] };

    expect(aliceList.conversations.length).toBeGreaterThan(0);
    expect(bobList.conversations).toHaveLength(0);
  });

  it("blocks another user from reading, editing or deleting a conversation", async () => {
    const { GET } = await import("@/app/api/conversations/route");
    const aliceList = (await (
      await GET(makeRequest("/api/conversations", { token: alice.token }), routeParams({}))
    ).json()) as { conversations: { id: string }[] };
    const conversationId = aliceList.conversations[0]!.id;

    const routes = await import("@/app/api/conversations/[id]/route");
    const read = await routes.GET(
      makeRequest(`/api/conversations/${conversationId}`, { token: bob.token }),
      routeParams({ id: conversationId }),
    );
    expect(read.status).toBe(404);

    const patch = await routes.PATCH(
      makeRequest(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        token: bob.token,
        body: { title: "hacked" },
      }),
      routeParams({ id: conversationId }),
    );
    expect(patch.status).toBe(404);

    const del = await routes.DELETE(
      makeRequest(`/api/conversations/${conversationId}`, {
        method: "DELETE",
        token: bob.token,
      }),
      routeParams({ id: conversationId }),
    );
    expect(del.status).toBe(404);
  });

  it("continues an existing conversation and returns its messages", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const first = await readSse(
      await POST(
        makeRequest("/api/chat", { token: bob.token, body: { message: "Første besked" } }),
        routeParams({}),
      ),
    );
    const created = first.find((e) => e.type === "message.created");
    if (created?.type !== "message.created") throw new Error("no conversation created");

    await readSse(
      await POST(
        makeRequest("/api/chat", {
          token: bob.token,
          body: { message: "Anden besked", conversationId: created.conversationId },
        }),
        routeParams({}),
      ),
    );

    const routes = await import("@/app/api/conversations/[id]/route");
    const detail = (await (
      await routes.GET(
        makeRequest(`/api/conversations/${created.conversationId}`, { token: bob.token }),
        routeParams({ id: created.conversationId }),
      )
    ).json()) as { messages: { role: string }[]; conversation: { title: string | null } };

    expect(detail.messages).toHaveLength(4);
    expect(detail.conversation.title).toBeTruthy();
  });

  it("enforces idempotency for duplicate sends", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const idempotencyKey = crypto.randomUUID();

    const first = await readSse(
      await POST(
        makeRequest("/api/chat", {
          token: alice.token,
          body: { message: "Dobbeltklik", idempotencyKey },
        }),
        routeParams({}),
      ),
    );
    const created = first.find((e) => e.type === "message.created");
    if (created?.type !== "message.created") throw new Error("no conversation");

    const second = await readSse(
      await POST(
        makeRequest("/api/chat", {
          token: alice.token,
          body: {
            message: "Dobbeltklik",
            conversationId: created.conversationId,
            idempotencyKey,
          },
        }),
        routeParams({}),
      ),
    );
    expect(second.some((e) => e.type === "error")).toBe(true);

    const userMessages = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, created.conversationId),
          eq(messages.role, "user"),
        ),
      );
    expect(userMessages).toHaveLength(1);
  });

  it("rejects oversized messages", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const response = await POST(
      makeRequest("/api/chat", { token: alice.token, body: { message: "x".repeat(9_000) } }),
      routeParams({}),
    );
    expect(response.status).toBe(400);
  });
});
