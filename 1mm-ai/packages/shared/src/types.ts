/** Core domain types shared between web, mobile and server packages. */

export type ConversationMode = "text" | "voice" | "mixed";

export type MessageRole = "user" | "assistant" | "system" | "tool";

export type MessageType = "text" | "transcript" | "tool_call" | "tool_result";

export type MessageStatus = "pending" | "streaming" | "completed" | "failed";

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  mode: ConversationMode;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  archivedAt: string | null;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  messageType: MessageType;
  status: MessageStatus;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export type MemoryCategory =
  | "preference"
  | "project"
  | "goal"
  | "work_method"
  | "fact"
  | "other";

export interface MemoryItem {
  id: string;
  category: MemoryCategory;
  content: string;
  importanceScore: number;
  confidenceScore: number;
  sourceConversationId: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

/** Server-sent events emitted by the chat streaming endpoint. */
export type ChatStreamEvent =
  | {
      type: "message.created";
      conversationId: string;
      userMessageId: string;
      assistantMessageId: string;
    }
  | { type: "delta"; text: string }
  | { type: "tool.started"; toolName: string }
  | { type: "tool.finished"; toolName: string }
  | { type: "conversation.title"; title: string }
  | { type: "done"; assistantMessageId: string }
  | { type: "error"; message: string; retryable: boolean };
