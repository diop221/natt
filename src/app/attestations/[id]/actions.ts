"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/app/tontines/[id]/actions";
import { getCurrentUser } from "@/lib/auth";
import { syncCertificate } from "@/lib/certificates";
import { db } from "@/lib/db";
import { isMockProvider } from "@/lib/payments";
import { simulateMockPayment } from "@/lib/payments/mock";

// Mode simulé : paie la facture de l'attestation.
export async function simulatePayCertificateAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const cert = await db.certificate.findUnique({ where: { id: String(form.get("id") ?? "") } });
  if (!isMockProvider() || !user || !cert || cert.userId !== user.id || !cert.invoiceId) return { error: "Indisponible." };
  await simulateMockPayment(cert.invoiceId);
  await syncCertificate(cert.id);
  revalidatePath(`/attestations/${cert.id}`);
  return undefined;
}
