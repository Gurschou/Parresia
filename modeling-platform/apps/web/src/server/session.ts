import { redirect } from "next/navigation";
import { auth } from "@/auth";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

/** Til server components/actions: kræver login, ellers redirect til /login. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user as SessionUser;
}

/** Til API-ruter: returnerer brugeren eller null (ruten svarer 401). */
export async function getApiUser(): Promise<SessionUser | null> {
  const session = await auth();
  return session?.user?.id ? (session.user as SessionUser) : null;
}
