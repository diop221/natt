export type InvoiceStatus = "pending" | "paid" | "expired" | "failed";

export interface Invoice {
  id: string;
  paymentRequest: string;
}

export interface PayoutRequest {
  amountXof: number; // montant que le bénéficiaire doit recevoir
  reference: string;
  beneficiary: { name: string; phone: string; network: string };
}

// COMPLETED : l'argent est arrivé. PENDING : accepté par le fournisseur, règlement en cours
// (à suivre par webhook ou avec getPayoutStatus).
export interface PayoutResult {
  id: string;
  status: "COMPLETED" | "PENDING";
}

export type PayoutStatus = "pending" | "paid" | "failed";

// Natt orchestre, le fournisseur détient et déplace l'argent.
// Isoler cette interface permet de changer de fournisseur sans toucher au reste.
export interface PaymentProvider {
  name: string;
  createInvoice(input: { sats: number; description: string; reference: string }): Promise<Invoice>;
  getInvoiceStatus(id: string): Promise<InvoiceStatus>;
  payout(input: PayoutRequest): Promise<PayoutResult>;
  getPayoutStatus(id: string): Promise<PayoutStatus>;
}
