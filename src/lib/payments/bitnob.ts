import { createHmac, randomBytes } from "node:crypto";
import type { InvoiceStatus, PaymentProvider, PayoutStatus } from "./types";

type BitnobPayout = { id: string; quote_id: string; status: string };

// Cycle de vie d'un payout (GET /api/payouts/:id) : QUOTE → INITIATED → PENDING → PROCESSING → COMPLETED / FAILED.
const payoutStatus = (status: string): PayoutStatus =>
  status === "COMPLETED" ? "paid" : ["FAILED", "EXPIRED", "CANCELLED", "REJECTED"].includes(status) ? "failed" : "pending";

// Client de l'API Bitnob (https://bitnob.dev/api-reference).
// Requêtes signées en HMAC-SHA256 : `${clientId}:${timestamp}:${nonce}:${body}`.

// Valeurs `network` acceptées pour le Sénégal (GET /api/payouts/supported-countries/SN, vérifié le 15/10/2026 :
// rail mobile_money, champ `network`, montants de 100 à 200 000 XOF, pas de vérification de nom pour SN).
const SN_NETWORKS: Record<string, string> = {
  wave: "wave",
  orange_money: "orange",
  free_money: "free",
  expresso: "expresso",
};

// Bitnob attend 771234567 ou 221771234567, sans « + ».
const snAccountNumber = (phone: string) => phone.replace(/^\+/, "");

function config() {
  const { BITNOB_BASE_URL, BITNOB_CLIENT_ID, BITNOB_CLIENT_SECRET } = process.env;
  if (!BITNOB_CLIENT_ID || !BITNOB_CLIENT_SECRET) {
    throw new Error("BITNOB_CLIENT_ID et BITNOB_CLIENT_SECRET sont requis");
  }
  // Même adresse en sandbox et en production : c'est la clé qui choisit l'environnement.
  return { base: BITNOB_BASE_URL || "https://api.bitnob.com", clientId: BITNOB_CLIENT_ID, secret: BITNOB_CLIENT_SECRET };
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const { base, clientId, secret } = config();
  const payload = body === undefined ? "" : JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", secret)
    .update(`${clientId}:${timestamp}:${nonce}:${payload}`)
    .digest("hex");

  const res = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Client": clientId,
      "X-Auth-Timestamp": timestamp,
      "X-Auth-Nonce": nonce,
      "X-Auth-Signature": signature,
    },
    body: payload || undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Bitnob ${method} ${path} → HTTP ${res.status} : ${json?.message ?? "erreur inconnue"}`);
  }
  // Certaines réponses sont enveloppées dans `data`, d'autres non.
  return (json?.data ?? json) as T;
}

// Garde-fou : Natt ne crée pas de facture et ne verse rien avec des clés de production
// (argent réel), sauf si BITNOB_ALLOW_LIVE=true. L'environnement est lu une fois via /api/whoami.
let environment: Promise<string> | null = null;
async function assertAllowedEnvironment() {
  environment ??= call<{ environment: string }>("GET", "/api/whoami").then((w) => w.environment);
  const env = await environment.catch((err) => {
    environment = null;
    throw err;
  });
  if (env === "live" && process.env.BITNOB_ALLOW_LIVE !== "true") {
    throw new Error("Clés Bitnob de production (argent réel) : ajoutez BITNOB_ALLOW_LIVE=true pour les autoriser.");
  }
}

export const bitnobProvider: PaymentProvider = {
  name: "bitnob",

  async createInvoice({ sats, description, reference }) {
    await assertAllowedEnvironment();
    const inv = await call<{ id: string; request: string }>("POST", "/api/lightning/invoices", {
      amount: sats,
      description,
      reference,
    });
    return { id: inv.id, paymentRequest: inv.request };
  },

  async getInvoiceStatus(id) {
    const inv = await call<{ status: InvoiceStatus; preimage?: string }>("GET", `/api/lightning/invoices/${id}`);
    // La doc recommande de confirmer le règlement par la présence de la preimage.
    if (inv.status === "paid" && !inv.preimage) return "pending";
    return inv.status;
  },

  async payout({ amountXof, reference, beneficiary }) {
    await assertAllowedEnvironment();
    const network = SN_NETWORKS[beneficiary.network];
    if (!network) throw new Error(`Opérateur inconnu : ${beneficiary.network}`);

    // Les réponses des payouts sont dans `data.payout` ; les étapes suivantes utilisent `quote_id` (QT2_…), pas `id`.
    const { payout: quote } = await call<{ payout: BitnobPayout }>("POST", "/api/payouts/quotes", {
      settlement_amount: String(amountXof),
      from_asset: "BTC",
      to_currency: "XOF",
      country: "SN",
      source: "offchain",
      reference: `${reference}-quote`,
    });
    const appUrl = process.env.APP_URL ?? "";
    await call("POST", `/api/payouts/${quote.quote_id}/initialize`, {
      quote_id: quote.quote_id,
      reference,
      payment_reason: "Versement de tontine Natt",
      // Suivi du règlement par webhook (payouts.withdrawal.success / expired), si l'application est joignable en HTTPS.
      ...(appUrl.startsWith("https://") && { callback_url: `${appUrl}/api/webhooks/bitnob` }),
      beneficiary: {
        destination_type: "mobile_money",
        country: "SN",
        network,
        account_name: beneficiary.name,
        account_number: snAccountNumber(beneficiary.phone),
        sender: { account_name: process.env.NATT_SENDER_NAME ?? "Natt", country: "SN" },
      },
    });
    const { payout } = await call<{ payout: BitnobPayout }>("POST", `/api/payouts/${quote.quote_id}/finalize`);
    // Après la finalisation, le payout est en général PENDING : l'argent n'est livré qu'à COMPLETED.
    return { id: payout.id, status: payout.status === "COMPLETED" ? "COMPLETED" : "PENDING" };
  },

  async getPayoutStatus(id) {
    const { payout } = await call<{ payout: BitnobPayout }>("GET", `/api/payouts/${id}`);
    return payoutStatus(payout.status);
  },
};
