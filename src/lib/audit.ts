import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// Journal d'une tontine : chaque vérification, changement de numéro ou échange de tour
// y est inscrit avec son auteur et son heure, et reste visible par les membres.
export function audit(
  entry: { tontineId: string; memberId?: string | null; actorId?: string | null; action: string; label: string },
  tx: Prisma.TransactionClient = db,
) {
  return tx.auditEntry.create({ data: entry });
}

// Numéro affiché partiellement dans le journal et sur les pages publiques.
// +221771234567 → +22177•••••67
export const maskPhone = (phone: string) => `${phone.slice(0, 6)}${"•".repeat(Math.max(phone.length - 8, 0))}${phone.slice(-2)}`;
