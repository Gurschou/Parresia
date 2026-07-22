import { z } from "zod";
import { LIMITS } from "./limits";

/** Zod schemas validating every client-supplied payload at the API boundary. */

export const registerSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(LIMITS.minPasswordLength).max(LIMITS.maxPasswordLength),
  displayName: z.string().trim().min(1).max(100).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(LIMITS.maxPasswordLength),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const chatRequestSchema = z.object({
  conversationId: z.uuid().optional(),
  message: z.string().trim().min(1).max(LIMITS.maxMessageLength),
  /**
   * Client-generated key so a double-click or network retry never creates
   * duplicate user messages.
   */
  idempotencyKey: z.uuid().optional(),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const chatStopSchema = z.object({
  conversationId: z.uuid(),
});
export type ChatStopInput = z.infer<typeof chatStopSchema>;

export const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(LIMITS.maxTitleLength).optional(),
  mode: z.enum(["text", "voice", "mixed"]).default("text"),
});
export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const updateConversationSchema = z
  .object({
    title: z.string().trim().min(1).max(LIMITS.maxTitleLength).optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => v.title !== undefined || v.archived !== undefined, {
    message: "Nothing to update",
  });
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;

export const memoryCategorySchema = z.enum([
  "preference",
  "project",
  "goal",
  "work_method",
  "fact",
  "other",
]);

export const createMemorySchema = z.object({
  category: memoryCategorySchema,
  content: z.string().trim().min(1).max(LIMITS.maxMemoryLength),
});
export type CreateMemoryInput = z.infer<typeof createMemorySchema>;

export const updateMemorySchema = z
  .object({
    category: memoryCategorySchema.optional(),
    content: z.string().trim().min(1).max(LIMITS.maxMemoryLength).optional(),
  })
  .refine((v) => v.category !== undefined || v.content !== undefined, {
    message: "Nothing to update",
  });
export type UpdateMemoryInput = z.infer<typeof updateMemorySchema>;

export const updatePreferencesSchema = z.object({
  autoMemoryEnabled: z.boolean().optional(),
  saveVoiceTranscripts: z.boolean().optional(),
  displayName: z.string().trim().min(1).max(100).optional(),
});
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

export const realtimeSessionRequestSchema = z.object({
  conversationId: z.uuid().optional(),
});
export type RealtimeSessionRequest = z.infer<typeof realtimeSessionRequestSchema>;

/** Transcript messages persisted at the end of a voice turn. */
export const saveTranscriptSchema = z.object({
  conversationId: z.uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(LIMITS.maxMessageLength),
});
export type SaveTranscriptInput = z.infer<typeof saveTranscriptSchema>;
