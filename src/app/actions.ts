"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { linkMemberships } from "@/lib/access";
import { createSession, destroySession, getCurrentUser, hashPassword, safeNext, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { LOCALE_COOKIE } from "@/lib/i18n";
import { normalizePhone } from "@/lib/phone";

// Les champs saisis sont renvoyés avec l'erreur : React vide le formulaire après l'envoi.
export type AuthState = { error?: string; name?: string; phone?: string } | undefined;

const phoneField = z
  .string()
  .transform((v) => normalizePhone(v))
  .refine((v): v is string => v !== null, "Numéro de téléphone invalide");

const signupSchema = z.object({
  name: z.string().trim().min(1, "Indiquez votre nom").max(60),
  phone: phoneField,
  password: z.string().min(8, "Le mot de passe doit faire au moins 8 caractères").max(200),
});

export async function signup(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  const typed = { name: String(form.get("name") ?? ""), phone: String(form.get("phone") ?? "") };
  if (!parsed.success) return { error: parsed.error.issues[0].message, ...typed };
  const { name, phone, password } = parsed.data;

  if (await db.user.findUnique({ where: { phone } })) {
    return { error: "Un compte existe déjà avec ce numéro. Connectez-vous.", ...typed };
  }
  const user = await db.user.create({ data: { name, phone, passwordHash: await hashPassword(password) } });
  await linkMemberships(user.id, phone);
  await createSession(user.id);
  redirect(safeNext(form.get("next")));
}

// Hash factice : le temps de réponse ne révèle pas si le numéro a un compte.
const DUMMY_HASH = hashPassword("natt-dummy-password");

export async function login(_prev: AuthState, form: FormData): Promise<AuthState> {
  const phone = normalizePhone(String(form.get("phone") ?? ""));
  const password = String(form.get("password") ?? "");
  const user = phone ? await db.user.findUnique({ where: { phone } }) : null;
  const ok = await verifyPassword(password, user?.passwordHash ?? (await DUMMY_HASH));
  if (!user || !ok) return { error: "Numéro ou mot de passe incorrect", phone: String(form.get("phone") ?? "") };

  await linkMemberships(user.id, user.phone);
  await createSession(user.id);
  redirect(safeNext(form.get("next")));
}

export async function logout() {
  await destroySession();
  redirect("/");
}

export async function setLocale(form: FormData) {
  const locale = form.get("locale") === "wo" ? "wo" : "fr";
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 365 * 24 * 3600, sameSite: "lax" });
  const user = await getCurrentUser();
  if (user) await db.user.update({ where: { id: user.id }, data: { locale } });
}
