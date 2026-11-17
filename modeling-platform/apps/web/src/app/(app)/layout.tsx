import { signOut } from "@/auth";
import { Sidebar } from "@/components/app/sidebar";
import { requireUser } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <Sidebar user={{ name: user.name, email: user.email }} signOutAction={signOutAction} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
