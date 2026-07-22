"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Archive, Brain, LogOut, Menu, MessageSquarePlus, Settings, Trash2, X } from "lucide-react";
import type { ConversationSummary } from "@1mm/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const CONVERSATIONS_CHANGED_EVENT = "onemm:conversations-changed";

/** Any component that mutates conversations fires this to refresh the list. */
export function notifyConversationsChanged(): void {
  window.dispatchEvent(new CustomEvent(CONVERSATIONS_CHANGED_EVENT));
}

interface SidebarProps {
  userEmail: string;
  displayName: string | null;
}

export function Sidebar({ userEmail, displayName }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/conversations");
      if (!response.ok) return;
      const body = (await response.json()) as { conversations: ConversationSummary[] };
      setConversations(body.conversations);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const handler = () => void load();
    window.addEventListener(CONVERSATIONS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(CONVERSATIONS_CHANGED_EVENT, handler);
  }, [load]);

  // Close the mobile drawer on navigation.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function deleteConversation(id: string) {
    if (!window.confirm("Slet samtalen permanent?")) return;
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    notifyConversationsChanged();
    if (pathname === `/chat/${id}`) router.push("/chat");
  }

  async function archiveConversation(id: string) {
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    notifyConversationsChanged();
    if (pathname === `/chat/${id}`) router.push("/chat");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const content = (
    <div className="flex h-full w-72 flex-col border-r border-border bg-surface">
      <div className="flex items-center justify-between p-4">
        <Link href="/chat" className="text-lg font-semibold">
          1MM <span className="text-primary">AI</span>
        </Link>
        <button
          type="button"
          className="rounded-lg p-2 text-text-secondary hover:bg-surface-raised md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Luk menu"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="px-3 pb-3">
        <Button className="w-full" onClick={() => router.push("/chat")}>
          <MessageSquarePlus className="h-4 w-4" aria-hidden />
          Ny samtale
        </Button>
      </div>

      <nav aria-label="Samtaler" className="min-h-0 flex-1 overflow-y-auto px-2">
        {loading ? (
          <ul className="space-y-2 p-1" aria-hidden>
            {[1, 2, 3].map((i) => (
              <li key={i} className="h-9 animate-pulse rounded-lg bg-surface-raised" />
            ))}
          </ul>
        ) : conversations.length === 0 ? (
          <p className="px-2 py-4 text-sm text-text-muted">
            Ingen samtaler endnu. Start din første!
          </p>
        ) : (
          <ul className="space-y-0.5">
            {conversations.map((c) => {
              const active = pathname === `/chat/${c.id}`;
              return (
                <li key={c.id} className="group relative">
                  <Link
                    href={`/chat/${c.id}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block truncate rounded-lg px-3 py-2 pr-16 text-sm",
                      active
                        ? "bg-surface-raised text-text-primary"
                        : "text-text-secondary hover:bg-surface-raised hover:text-text-primary",
                    )}
                  >
                    {c.title ?? "Ny samtale"}
                  </Link>
                  <span className="absolute top-1/2 right-1 hidden -translate-y-1/2 gap-0.5 group-focus-within:flex group-hover:flex">
                    <button
                      type="button"
                      onClick={() => archiveConversation(c.id)}
                      aria-label={`Arkivér samtalen ${c.title ?? "Ny samtale"}`}
                      className="rounded p-1.5 text-text-muted hover:bg-surface hover:text-text-primary"
                    >
                      <Archive className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteConversation(c.id)}
                      aria-label={`Slet samtalen ${c.title ?? "Ny samtale"}`}
                      className="rounded p-1.5 text-text-muted hover:bg-surface hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      <div className="border-t border-border p-3">
        <div className="mb-2 flex gap-1">
          <Link
            href="/memories"
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs",
              pathname === "/memories"
                ? "bg-surface-raised text-text-primary"
                : "text-text-secondary hover:bg-surface-raised",
            )}
          >
            <Brain className="h-4 w-4" aria-hidden />
            Hukommelse
          </Link>
          <Link
            href="/settings"
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs",
              pathname === "/settings"
                ? "bg-surface-raised text-text-primary"
                : "text-text-secondary hover:bg-surface-raised",
            )}
          >
            <Settings className="h-4 w-4" aria-hidden />
            Indstillinger
          </Link>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-text-muted" title={userEmail}>
            {displayName ?? userEmail}
          </span>
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-text-secondary hover:bg-surface-raised hover:text-text-primary"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Log ud
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile: hamburger + drawer */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Åbn menu"
        className="fixed top-3 left-3 z-40 rounded-lg border border-border bg-surface p-2.5 text-text-secondary md:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="h-full">{content}</div>
          <button
            type="button"
            className="flex-1 bg-black/60"
            aria-label="Luk menu"
            onClick={() => setMobileOpen(false)}
          />
        </div>
      )}
      {/* Desktop: fixed sidebar */}
      <div className="hidden md:block">{content}</div>
    </>
  );
}
