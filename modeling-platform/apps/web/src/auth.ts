import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { LoginSchema, authenticate } from "@/server/users";

declare module "next-auth" {
  interface Session {
    user: { id: string; name: string; email: string };
  }
}

const devSecret = process.env.NODE_ENV !== "production" ? "dev-only-insecure-secret-change-me-please" : undefined;

/**
 * Simpel e-mail/password-auth (Auth.js v5, Credentials + JWT-sessioner).
 * Brugere oprettes via /register (server action → createUser).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET ?? devSecret,
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: { label: "E-mail" }, password: { label: "Adgangskode", type: "password" } },
      authorize: async (raw) => {
        const parsed = LoginSchema.safeParse(raw);
        if (!parsed.success) return null;
        return authenticate(parsed.data.email, parsed.data.password);
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      return session;
    },
  },
});
