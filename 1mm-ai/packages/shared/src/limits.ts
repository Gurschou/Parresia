/**
 * Hard limits enforced by Zod schemas and the API layer.
 * Keeping them here means web, mobile and server agree on the same values.
 */
export const LIMITS = {
  /** Maximum characters in a single user message. */
  maxMessageLength: 8_000,
  /** Maximum characters in a memory entry. */
  maxMemoryLength: 1_000,
  /** Maximum characters in a conversation title. */
  maxTitleLength: 120,
  /** Maximum memories injected into a single prompt. */
  maxMemoriesInPrompt: 8,
  /** Maximum recent messages sent as model context. */
  maxContextMessages: 20,
  /** Minimum / maximum password length. */
  minPasswordLength: 8,
  maxPasswordLength: 128,
} as const;
