import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeRequest, registerUser, routeParams, setupTestApp } from "./helpers";

let close: () => Promise<void>;

beforeAll(async () => {
  ({ close } = await setupTestApp());
});

afterAll(async () => {
  await close();
});

describe("auth flow", () => {
  it("registers, logs in and resolves the session", async () => {
    const { token } = await registerUser("auth-flow@example.com", "hunter2hunter2");

    const { GET } = await import("@/app/api/auth/me/route");
    const meResponse = await GET(makeRequest("/api/auth/me", { token }), routeParams({}));
    expect(meResponse.status).toBe(200);
    const me = (await meResponse.json()) as { user: { email: string } };
    expect(me.user.email).toBe("auth-flow@example.com");

    const { POST: login } = await import("@/app/api/auth/login/route");
    const loginResponse = await login(
      makeRequest("/api/auth/login", {
        body: { email: "auth-flow@example.com", password: "hunter2hunter2" },
      }),
      routeParams({}),
    );
    expect(loginResponse.status).toBe(200);
  });

  it("rejects wrong passwords and duplicate emails", async () => {
    await registerUser("dupes@example.com");

    const { POST: register } = await import("@/app/api/auth/register/route");
    const duplicate = await register(
      makeRequest("/api/auth/register", {
        body: { email: "dupes@example.com", password: "password-123" },
      }),
      routeParams({}),
    );
    expect(duplicate.status).toBe(409);

    const { POST: login } = await import("@/app/api/auth/login/route");
    const wrongPassword = await login(
      makeRequest("/api/auth/login", {
        body: { email: "dupes@example.com", password: "wrong-password" },
      }),
      routeParams({}),
    );
    expect(wrongPassword.status).toBe(401);
  });

  it("rejects unauthenticated access to private routes", async () => {
    const { GET } = await import("@/app/api/auth/me/route");
    const response = await GET(makeRequest("/api/auth/me"), routeParams({}));
    expect(response.status).toBe(401);
  });

  it("validates input with Zod", async () => {
    const { POST: register } = await import("@/app/api/auth/register/route");
    const badEmail = await register(
      makeRequest("/api/auth/register", { body: { email: "not-an-email", password: "password-123" } }),
      routeParams({}),
    );
    expect(badEmail.status).toBe(400);

    const shortPassword = await register(
      makeRequest("/api/auth/register", { body: { email: "ok@example.com", password: "short" } }),
      routeParams({}),
    );
    expect(shortPassword.status).toBe(400);
  });
});
