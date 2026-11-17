import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Log ind" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  return (
    <>
      <h2 className="text-3xl font-semibold">Velkommen tilbage</h2>
      <p className="mb-8 mt-2 text-muted-foreground">Log ind for at fortsætte med dine modeller.</p>
      <AuthForm mode="login" callbackUrl={callbackUrl} />
    </>
  );
}
