import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Opret konto" };

export default function RegisterPage() {
  return (
    <>
      <h2 className="text-3xl">Opret din konto</h2>
      <p className="mb-8 mt-2 text-muted-foreground">Kom i gang med at modellere eksperter på få minutter.</p>
      <AuthForm mode="register" />
    </>
  );
}
