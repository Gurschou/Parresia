import type { Metadata } from "next";
import { AuthForm, DemoLoginButton } from "../auth-form";

export const metadata: Metadata = { title: "Log ind" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  // Ét-klik demo-login (fx til preview/demo). Kun når DEMO_LOGIN=1 er sat.
  const demo =
    process.env.DEMO_LOGIN === "1"
      ? { email: process.env.SEED_EMAIL ?? "demo@parresia.dk", password: process.env.SEED_PASSWORD ?? "demo1234" }
      : null;
  return (
    <>
      <h2 className="text-3xl">Velkommen tilbage</h2>
      <p className="mb-8 mt-2 text-muted-foreground">Log ind for at fortsætte med dine modeller.</p>
      {demo && <DemoLoginButton email={demo.email} password={demo.password} callbackUrl={callbackUrl} />}
      <AuthForm mode="login" callbackUrl={callbackUrl} />
    </>
  );
}
