import { redirect } from "next/navigation";
import { ErrorBoundary } from "@/components/error-boundary";
import { Sidebar } from "@/components/sidebar";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar userEmail={user.email} displayName={user.displayName} />
      <main className="flex min-w-0 flex-1 flex-col">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  );
}
