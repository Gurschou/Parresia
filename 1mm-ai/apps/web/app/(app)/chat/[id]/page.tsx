import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { conversations, getDb, messages } from "@1mm/database";
import { ChatView } from "@/components/chat/chat-view";
import type { UiMessage } from "@/components/chat/use-chat";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ConversationPage({ params }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const db = getDb();
  const [conversation] = await db
    .select({ id: conversations.id, title: conversations.title })
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, user.id)))
    .limit(1);
  if (!conversation) notFound();

  const rows = await db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      messageType: messages.messageType,
      status: messages.status,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(and(eq(messages.conversationId, conversation.id), eq(messages.userId, user.id)))
    .orderBy(asc(messages.createdAt));

  const initialMessages: UiMessage[] = rows
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.status !== "failed")
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      messageType: m.messageType,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
    }));

  return (
    <ChatView
      key={conversation.id}
      initialConversationId={conversation.id}
      initialTitle={conversation.title}
      initialMessages={initialMessages}
    />
  );
}
