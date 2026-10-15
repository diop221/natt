"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/app/tontines/[id]/actions";
import { findByNumber } from "@/lib/certificates";
import { getDict } from "@/lib/i18n";

// Portail public : référence + nom du titulaire, pour qu'on ne puisse pas parcourir les attestations au hasard.
export async function lookupAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = await findByNumber(String(form.get("number") ?? ""), String(form.get("name") ?? ""));
  if (!id) return { error: (await getDict()).verifyPortal.notFound };
  redirect(`/v/${id}`);
}
