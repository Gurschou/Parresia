import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeRequest, registerUser, routeParams, setupTestApp } from "./helpers";

let close: () => Promise<void>;
let owner: { token: string; userId: string };
let stranger: { token: string; userId: string };

beforeAll(async () => {
  ({ close } = await setupTestApp());
  owner = await registerUser("memory-owner@example.com");
  stranger = await registerUser("memory-stranger@example.com");
});

afterAll(async () => {
  await close();
});

async function createMemory(token: string, content: string): Promise<string> {
  const { POST } = await import("@/app/api/memories/route");
  const response = await POST(
    makeRequest("/api/memories", { token, body: { category: "fact", content } }),
    routeParams({}),
  );
  expect(response.status).toBe(201);
  const body = (await response.json()) as { memory: { id: string } };
  return body.memory.id;
}

describe("memories", () => {
  it("creates, edits and deletes a memory", async () => {
    const id = await createMemory(owner.token, "Kan lide espresso");

    const routes = await import("@/app/api/memories/[id]/route");
    const patch = await routes.PATCH(
      makeRequest(`/api/memories/${id}`, {
        method: "PATCH",
        token: owner.token,
        body: { content: "Kan lide filterkaffe" },
      }),
      routeParams({ id }),
    );
    expect(patch.status).toBe(200);
    const patched = (await patch.json()) as { memory: { content: string } };
    expect(patched.memory.content).toBe("Kan lide filterkaffe");

    const del = await routes.DELETE(
      makeRequest(`/api/memories/${id}`, { method: "DELETE", token: owner.token }),
      routeParams({ id }),
    );
    expect(del.status).toBe(200);

    const { GET } = await import("@/app/api/memories/route");
    const list = (await (
      await GET(makeRequest("/api/memories", { token: owner.token }), routeParams({}))
    ).json()) as { memories: { id: string }[] };
    expect(list.memories.find((m) => m.id === id)).toBeUndefined();
  });

  it("blocks other users from touching a memory", async () => {
    const id = await createMemory(owner.token, "Privat oplysning");
    const routes = await import("@/app/api/memories/[id]/route");

    const patch = await routes.PATCH(
      makeRequest(`/api/memories/${id}`, {
        method: "PATCH",
        token: stranger.token,
        body: { content: "hacked" },
      }),
      routeParams({ id }),
    );
    expect(patch.status).toBe(404);

    const del = await routes.DELETE(
      makeRequest(`/api/memories/${id}`, { method: "DELETE", token: stranger.token }),
      routeParams({ id }),
    );
    expect(del.status).toBe(404);
  });

  it("'forget everything' clears the list", async () => {
    await createMemory(owner.token, "Memory A");
    await createMemory(owner.token, "Memory B");

    const { DELETE, GET } = await import("@/app/api/memories/route");
    const wipe = await DELETE(
      makeRequest("/api/memories", { method: "DELETE", token: owner.token }),
      routeParams({}),
    );
    expect(wipe.status).toBe(200);

    const list = (await (
      await GET(makeRequest("/api/memories", { token: owner.token }), routeParams({}))
    ).json()) as { memories: unknown[] };
    expect(list.memories).toHaveLength(0);
  });

  it("rejects invalid categories", async () => {
    const { POST } = await import("@/app/api/memories/route");
    const response = await POST(
      makeRequest("/api/memories", {
        token: owner.token,
        body: { category: "not-a-category", content: "x" },
      }),
      routeParams({}),
    );
    expect(response.status).toBe(400);
  });
});
