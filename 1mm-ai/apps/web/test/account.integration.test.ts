import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { conversations, memories, messages, users, type Database } from "@1mm/database";
import { makeRequest, readSse, registerUser, routeParams, setupTestApp } from "./helpers";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await setupTestApp());
});

afterAll(async () => {
  await close();
});

describe("account lifecycle", () => {
  it("exports the user's data as JSON", async () => {
    const user = await registerUser("export@example.com");
    const { POST: chat } = await import("@/app/api/chat/route");
    await readSse(
      await chat(
        makeRequest("/api/chat", { token: user.token, body: { message: "Eksportér mig" } }),
        routeParams({}),
      ),
    );

    const { GET } = await import("@/app/api/account/export/route");
    const response = await GET(
      makeRequest("/api/account/export", { token: user.token }),
      routeParams({}),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      user: { email: string };
      conversations: unknown[];
      messages: unknown[];
    };
    expect(body.user.email).toBe("export@example.com");
    expect(body.conversations.length).toBeGreaterThan(0);
    expect(body.messages.length).toBeGreaterThan(0);
  });

  it("deletes the account and every related row", async () => {
    const user = await registerUser("goodbye@example.com");

    const { POST: chat } = await import("@/app/api/chat/route");
    await readSse(
      await chat(
        makeRequest("/api/chat", {
          token: user.token,
          body: { message: "Husk at jeg elsker kaffe" },
        }),
        routeParams({}),
      ),
    );

    const { DELETE } = await import("@/app/api/account/route");
    const response = await DELETE(
      makeRequest("/api/account", { method: "DELETE", token: user.token }),
      routeParams({}),
    );
    expect(response.status).toBe(200);

    expect(await db.select().from(users).where(eq(users.id, user.userId))).toHaveLength(0);
    expect(
      await db.select().from(conversations).where(eq(conversations.userId, user.userId)),
    ).toHaveLength(0);
    expect(await db.select().from(messages).where(eq(messages.userId, user.userId))).toHaveLength(
      0,
    );
    expect(await db.select().from(memories).where(eq(memories.userId, user.userId))).toHaveLength(
      0,
    );

    // The old session token no longer works.
    const { GET: me } = await import("@/app/api/auth/me/route");
    const meResponse = await me(makeRequest("/api/auth/me", { token: user.token }), routeParams({}));
    expect(meResponse.status).toBe(401);
  });
});
