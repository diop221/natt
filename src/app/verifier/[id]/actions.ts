"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/app/tontines/[id]/actions";
import { getDict } from "@/lib/i18n";
import { NattError } from "@/lib/tontine";
import { checkVerificationCode, sendVerificationCode } from "@/lib/verification";

// Page publique : la seule chose qu'on peut y faire est demander un code (limité dans le temps)
// et le saisir. Le code part toujours sur le numéro enregistré, jamais sur un numéro saisi ici.

async function run(memberId: string, fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const ok = await fn();
    revalidatePath(`/verifier/${memberId}`);
    return { ok: ok || undefined };
  } catch (err) {
    if (err instanceof NattError) return { error: err.message };
    throw err;
  }
}

export async function sendCodeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const memberId = String(form.get("memberId") ?? "");
  const t = await getDict();
  return run(memberId, async () => {
    await sendVerificationCode(memberId);
    return t.verify.sent;
  });
}

export async function checkCodeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const memberId = String(form.get("memberId") ?? "");
  const code = String(form.get("code") ?? "").replace(/\D/g, "");
  return run(memberId, async () => {
    if (code.length !== 6) throw new NattError("Le code a 6 chiffres.");
    await checkVerificationCode(memberId, code);
  });
}
