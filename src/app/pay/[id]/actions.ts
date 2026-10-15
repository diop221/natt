"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

// Un proche indique son nom avant de payer la cotisation d'un membre.
// Page publique : on n'accepte qu'un nom court, et seulement tant que la cotisation n'est pas payée.
export async function setSponsorName(form: FormData) {
  const id = String(form.get("id") ?? "");
  const name = String(form.get("sponsorName") ?? "").trim().slice(0, 60);
  if (!name) return;
  await db.contribution.updateMany({ where: { id, status: "pending" }, data: { sponsorName: name } });
  revalidatePath(`/pay/${id}`);
}
