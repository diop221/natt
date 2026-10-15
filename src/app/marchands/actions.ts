"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/app/tontines/[id]/actions";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createMerchant, createOffer, isNattAdmin, markDelivered, verifyMerchant } from "@/lib/merchants";
import { normalizePhone } from "@/lib/phone";
import { NattError } from "@/lib/tontine";

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

// Réservé à l'équipe Natt (NATT_ADMIN_PHONES).
async function admin(fn: () => Promise<string | void>): Promise<ActionState> {
  if (!isNattAdmin(await getCurrentUser())) return { error: "Action non autorisée." };
  try {
    const ok = await fn();
    revalidatePath("/marchands");
    revalidatePath("/marchands/admin");
    return { ok: ok || undefined };
  } catch (err) {
    if (err instanceof NattError) return { error: err.message };
    throw err;
  }
}

export async function createMerchantAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return admin(async () => {
    const phone = normalizePhone(str(form, "phone"));
    if (!phone) throw new NattError("Numéro de téléphone invalide.");
    const name = str(form, "name").slice(0, 80);
    if (!name) throw new NattError("Indiquez le nom du marchand.");
    await createMerchant({
      name,
      category: str(form, "category"),
      description: str(form, "description").slice(0, 300),
      city: str(form, "city").slice(0, 60),
      phone,
      network: str(form, "network"),
      commissionBps: Math.round(Number(form.get("commissionPct")) * 100),
    });
    return "Marchand ajouté. Vérifiez son numéro avant qu'il ne soit payé.";
  });
}

export async function verifyMerchantAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return admin(() => verifyMerchant(str(form, "merchantId")));
}

export async function toggleMerchantAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return admin(async () => {
    await db.merchant.update({ where: { id: str(form, "merchantId") }, data: { active: form.get("active") === "1" } });
  });
}

export async function createOfferAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return admin(async () => {
    const title = str(form, "title").slice(0, 80);
    if (!title) throw new NattError("Indiquez le nom de l'offre.");
    await createOffer({
      merchantId: str(form, "merchantId"),
      title,
      description: str(form, "description").slice(0, 300),
      priceXof: Number(form.get("priceXof")),
      nattPriceXof: Number(form.get("nattPriceXof")),
      delivery: str(form, "delivery").slice(0, 200) || null,
    });
    return "Offre publiée.";
  });
}

export async function toggleOfferAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return admin(async () => {
    await db.offer.update({ where: { id: str(form, "offerId") }, data: { active: form.get("active") === "1" } });
  });
}

// Page publique du marchand (lien secret reçu par WhatsApp).
export async function deliveredAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const token = str(form, "token");
  try {
    await markDelivered(token);
    revalidatePath(`/commandes/${token}`);
    return undefined;
  } catch (err) {
    if (err instanceof NattError) return { error: err.message };
    throw err;
  }
}
