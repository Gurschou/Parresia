import { NextRequest } from "next/server";
import { MockAIProvider, setAIProviderForTesting } from "@1mm/ai";
import { setDbForTesting, type Database } from "@1mm/database";
import { createTestDatabase } from "@1mm/database/testing";
import { createSseParser, type ChatStreamEvent } from "@1mm/shared";
import { resetRateLimits } from "@/lib/rate-limit";

process.env.AUTH_SECRET = "test-secret-at-least-16-chars";
process.env.MOCK_AI = "1";

/** Boots an isolated PGlite database + mock provider for a test file. */
export async function setupTestApp(): Promise<{ db: Database; close: () => Promise<void> }> {
  const { db, close } = await createTestDatabase();
  setDbForTesting(db);
  setAIProviderForTesting(new MockAIProvider());
  resetRateLimits();
  return { db, close };
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

/** Builds a NextRequest the way route handlers expect it. */
export function makeRequest(path: string, options: RequestOptions = {}): NextRequest {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  // Unique per-request pseudo-IP keeps the auth rate limiter out of the way.
  headers.set("x-forwarded-for", crypto.randomUUID());
  return new NextRequest(`http://localhost:3000${path}`, {
    method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

export function routeParams(params: Record<string, string>): {
  params: Promise<Record<string, string>>;
} {
  return { params: Promise.resolve(params) };
}

/** Registers a user through the real route and returns a Bearer token. */
export async function registerUser(
  email: string,
  password = "password-123",
): Promise<{ token: string; userId: string }> {
  const { POST } = await import("@/app/api/auth/register/route");
  const response = await POST(
    makeRequest("/api/auth/register", { body: { email, password } }),
    routeParams({}),
  );
  if (response.status !== 201) {
    throw new Error(`register failed: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { user: { id: string }; token: string };
  return { token: body.token, userId: body.user.id };
}

/** Reads an SSE response fully and returns the parsed chat events. */
export async function readSse(response: Response): Promise<ChatStreamEvent[]> {
  if (!response.body) throw new Error("response has no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  const events: ChatStreamEvent[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    events.push(...parser.push(decoder.decode(value, { stream: true })));
  }
  return events;
}
