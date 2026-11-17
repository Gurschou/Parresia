"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, registerAction, type AuthFormState } from "./actions";

export function AuthForm({ mode, callbackUrl }: { mode: "login" | "register"; callbackUrl?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    mode === "login" ? loginAction : registerAction,
    {},
  );
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-5" noValidate>
      {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}
      {state.error && (
        <Alert tone="negative">
          <AlertCircle />
          <span>{state.error}</span>
        </Alert>
      )}
      {mode === "register" && (
        <Field id="name" label="Navn" error={fe.name}>
          <Input id="name" name="name" autoComplete="name" defaultValue={state.values?.name} required aria-invalid={!!fe.name} />
        </Field>
      )}
      <Field id="email" label="E-mail" error={fe.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.values?.email}
          required
          aria-invalid={!!fe.email}
          placeholder="navn@firma.dk"
        />
      </Field>
      <Field id="password" label="Adgangskode" error={fe.password} hint={mode === "register" ? "Mindst 8 tegn" : undefined}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          aria-invalid={!!fe.password}
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        {mode === "login" ? "Log ind" : "Opret konto"}
        {!pending && <ArrowRight />}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            Ny her?{" "}
            <Link href="/register" className="font-semibold text-primary hover:underline">
              Opret en konto
            </Link>
          </>
        ) : (
          <>
            Har du allerede en konto?{" "}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Log ind
            </Link>
          </>
        )}
      </p>
    </form>
  );
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id}>{label}</Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
