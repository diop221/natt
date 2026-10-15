import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { type Dict, fr } from "./fr";
import { wo } from "./wo";

export type { Dict };
export type Locale = "fr" | "wo";
export const LOCALE_COOKIE = "natt_lang";

// Langue : celle du compte, sinon celle choisie sur cet appareil, sinon le français.
export async function getLocale(): Promise<Locale> {
  const user = await getCurrentUser();
  const value = user?.locale ?? (await cookies()).get(LOCALE_COOKIE)?.value;
  return value === "wo" ? "wo" : "fr";
}

export async function getDict(): Promise<Dict> {
  return (await getLocale()) === "wo" ? wo : fr;
}

export { tf } from "./tf";
