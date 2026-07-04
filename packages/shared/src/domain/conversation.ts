/** Conversation domain model shared by the chat interface and engines. */
export type MessageRole = "user" | "assistant" | "system";

export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  /** Which agent produced the message (assistant messages only). */
  agent?: string;
  /** Which underlying model served the request (for transparency/audit). */
  model?: string;
}

export interface Session {
  id: string;
  userId: string;
  startedAt: string;
  endedAt?: string;
  title?: string;
}
