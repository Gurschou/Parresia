"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { RegisterSchema, UserExistsError, createUser } from "@/server/users";

export interface AuthFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
}

const safeRedirect = (to: FormDataEntryValue | null) => {
  const s = typeof to === "string" ? to : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
};

export async function loginAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  try {
    await signIn("credentials", {
      email,
      password: String(formData.get("password") ?? ""),
      redirectTo: safeRedirect(formData.get("callbackUrl")),
    });
    return {};
  } catch (err) {
    if (err instanceof AuthError) return { error: "Forkert e-mail eller adgangskode.", values: { email } };
    throw err; // redirect-signalet ved succes skal boble videre
  }
}

export async function registerAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = { name: String(formData.get("name") ?? ""), email: String(formData.get("email") ?? "") };
  const parsed = RegisterSchema.safeParse({ ...values, password: formData.get("password") });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors, values };
  }
  try {
    await createUser(parsed.data);
  } catch (err) {
    if (err instanceof UserExistsError) return { fieldErrors: { email: err.message }, values };
    throw err;
  }
  try {
    await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirectTo: "/analyses/new?welcome=1" });
  } catch (err) {
    if (err instanceof AuthError) return { error: "Kontoen blev oprettet, men login fejlede. Prøv at logge ind.", values };
    throw err;
  }
  return {};
}
