"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AuthFormProps {
  mode: "login" | "register";
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "register"
            ? { email, password, displayName: displayName || undefined }
            : { email, password },
        ),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? "Noget gik galt. Prøv igen.");
        return;
      }
      router.push("/chat");
      router.refresh();
    } catch {
      setError("Kunne ikke kontakte serveren. Tjek din forbindelse.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8">
        <h1 className="mb-1 text-2xl font-semibold">1MM AI</h1>
        <p className="mb-6 text-sm text-text-secondary">
          {mode === "login" ? "Log ind på din konto" : "Opret en ny konto"}
        </p>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {mode === "register" && (
            <div>
              <label htmlFor="displayName" className="mb-1 block text-sm text-text-secondary">
                Navn (valgfrit)
              </label>
              <Input
                id="displayName"
                name="displayName"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
          )}
          <div>
            <label htmlFor="email" className="mb-1 block text-sm text-text-secondary">
              E-mail
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-text-secondary">
              Adgangskode
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={mode === "register" ? 8 : undefined}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === "register" && (
              <p className="mt-1 text-xs text-text-muted">Mindst 8 tegn.</p>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Vent…" : mode === "login" ? "Log ind" : "Opret konto"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-text-secondary">
          {mode === "login" ? (
            <>
              Har du ikke en konto?{" "}
              <Link className="text-accent underline" href="/register">
                Opret konto
              </Link>
            </>
          ) : (
            <>
              Har du allerede en konto?{" "}
              <Link className="text-accent underline" href="/login">
                Log ind
              </Link>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
