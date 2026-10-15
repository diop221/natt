import { randomBytes, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { PaymentProvider } from "./types";

// Fournisseur simulé : les factures sont stockées en base et marquées payées
// depuis le tableau de bord (bouton « Simuler le paiement »).
export const mockProvider: PaymentProvider = {
  name: "mock",

  async createInvoice({ sats }) {
    const id = `mock_${randomUUID()}`;
    await db.mockInvoice.create({ data: { id, sats } });
    return { id, paymentRequest: `lnbcrt${sats}n1mock${randomBytes(40).toString("hex")}` };
  },

  async getInvoiceStatus(id) {
    const invoice = await db.mockInvoice.findUnique({ where: { id } });
    return (invoice?.status as "pending" | "paid") ?? "failed";
  },

  async payout({ reference }) {
    return { id: `mock_payout_${reference}`, status: "COMPLETED" };
  },

  async getPayoutStatus() {
    return "paid";
  },
};

export async function simulateMockPayment(invoiceId: string) {
  await db.mockInvoice.update({ where: { id: invoiceId }, data: { status: "paid" } });
}
