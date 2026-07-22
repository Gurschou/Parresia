import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createTestDatabase } from "@1mm/database/testing";
import { users, type Database } from "@1mm/database";
import { executeTool, getToolDefinitions, isAllowedTool } from "../src/tools/registry";

let db: Database;
let close: () => Promise<void>;
let userId: string;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
  const [user] = await db
    .insert(users)
    .values({ email: "tool@example.com", passwordHash: "x", displayName: "Tool Tester" })
    .returning({ id: users.id });
  userId = user!.id;
});

afterAll(async () => {
  await close();
});

describe("tool allowlist", () => {
  it("only exposes allowlisted tools", () => {
    const names = getToolDefinitions().map((t) => t.name);
    expect(names).toEqual(["get_current_user_profile"]);
    expect(isAllowedTool("get_current_user_profile")).toBe(true);
    expect(isAllowedTool("delete_all_users")).toBe(false);
  });

  it("rejects execution of unknown tool names", async () => {
    const result = await executeTool("drop_database", "{}", { userId, db });
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Unknown tool");
  });

  it("rejects invalid arguments via Zod", async () => {
    const result = await executeTool("get_current_user_profile", '{"evil": true}', { userId, db });
    expect(result.ok).toBe(false);
  });

  it("returns only the current user's profile", async () => {
    // A second user must never leak through the tool.
    await db
      .insert(users)
      .values({ email: "other@example.com", passwordHash: "y", displayName: "Other" });

    const result = await executeTool("get_current_user_profile", "{}", { userId, db });
    expect(result.ok).toBe(true);
    const profile = JSON.parse(result.output) as { email: string; displayName: string };
    expect(profile.email).toBe("tool@example.com");
    expect(profile.displayName).toBe("Tool Tester");
  });
});
