"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/app/tontines/[id]/actions";
import { getCurrentUser } from "@/lib/auth";
import { requestCertificate, revokeCertificate } from "@/lib/certificates";
import { NattError } from "@/lib/tontine";

export async function requestCertificateAction(): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Connectez-vous." };
  let id: string;
  try {
    ({ id } = await requestCertificate(user.id));
  } catch (err) {
    if (err instanceof NattError) return { error: err.message };
    throw err;
  }
  redirect(`/attestations/${id}`);
}

export async function revokeCertificateAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Connectez-vous." };
  const id = String(form.get("id") ?? "");
  try {
    await revokeCertificate(id, user.id);
  } catch (err) {
    if (err instanceof NattError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/attestations/${id}`);
  return undefined;
}
