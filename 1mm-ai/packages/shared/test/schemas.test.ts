import { describe, expect, it } from "vitest";
import {
  chatRequestSchema,
  createMemorySchema,
  loginSchema,
  registerSchema,
  updateConversationSchema,
  updateMemorySchema,
} from "../src/schemas";
import { LIMITS } from "../src/limits";

describe("registerSchema", () => {
  it("accepts a valid registration", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "supersecret1",
      displayName: "Test User",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid emails and short passwords", () => {
    expect(registerSchema.safeParse({ email: "nope", password: "supersecret1" }).success).toBe(
      false,
    );
    expect(
      registerSchema.safeParse({ email: "user@example.com", password: "short" }).success,
    ).toBe(false);
  });
});

describe("loginSchema", () => {
  it("requires both fields", () => {
    expect(loginSchema.safeParse({ email: "user@example.com" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "user@example.com", password: "x" }).success).toBe(true);
  });
});

describe("chatRequestSchema", () => {
  it("rejects empty and oversized messages", () => {
    expect(chatRequestSchema.safeParse({ message: "   " }).success).toBe(false);
    expect(
      chatRequestSchema.safeParse({ message: "a".repeat(LIMITS.maxMessageLength + 1) }).success,
    ).toBe(false);
  });

  it("accepts a message with optional conversationId and idempotencyKey", () => {
    const result = chatRequestSchema.safeParse({
      message: "Hej 1MM",
      conversationId: "7a7b1f7e-6f0d-4bfb-9c39-9d9f2a4d1a11",
      idempotencyKey: "aa7b1f7e-6f0d-4bfb-9c39-9d9f2a4d1a22",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-uuid conversation ids", () => {
    expect(
      chatRequestSchema.safeParse({ message: "hej", conversationId: "1; DROP TABLE" }).success,
    ).toBe(false);
  });
});

describe("memory schemas", () => {
  it("validates category against the allowlist", () => {
    expect(createMemorySchema.safeParse({ category: "hacking", content: "x" }).success).toBe(
      false,
    );
    expect(
      createMemorySchema.safeParse({ category: "preference", content: "Foretrækker dansk" })
        .success,
    ).toBe(true);
  });

  it("update requires at least one field", () => {
    expect(updateMemorySchema.safeParse({}).success).toBe(false);
    expect(updateMemorySchema.safeParse({ content: "opdateret" }).success).toBe(true);
  });
});

describe("updateConversationSchema", () => {
  it("requires at least one field", () => {
    expect(updateConversationSchema.safeParse({}).success).toBe(false);
    expect(updateConversationSchema.safeParse({ title: "Ny titel" }).success).toBe(true);
    expect(updateConversationSchema.safeParse({ archived: true }).success).toBe(true);
  });
});
