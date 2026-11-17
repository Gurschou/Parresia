import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { hashPassword, verifyPassword } from "./password";

export const RegisterSchema = z.object({
  name: z.string().trim().min(2, "Navnet skal være mindst 2 tegn").max(80),
  email: z.string().trim().toLowerCase().email("Ugyldig e-mailadresse"),
  password: z.string().min(8, "Adgangskoden skal være mindst 8 tegn").max(200),
});

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export class UserExistsError extends Error {}

export async function createUser(input: z.infer<typeof RegisterSchema>) {
  const db = await getDb();
  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, input.email) });
  if (existing) throw new UserExistsError("Der findes allerede en bruger med den e-mail.");
  const [user] = await db
    .insert(schema.users)
    .values({ name: input.name, email: input.email, passwordHash: await hashPassword(input.password) })
    .returning({ id: schema.users.id, email: schema.users.email, name: schema.users.name });
  return user!;
}

export async function authenticate(email: string, password: string) {
  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email.trim().toLowerCase()) });
  if (!user || !(await verifyPassword(password, user.passwordHash))) return null;
  return { id: user.id, email: user.email, name: user.name };
}
