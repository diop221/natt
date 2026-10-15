// Conversion FCFA ↔ satoshis. Les montants sont fixés en FCFA ; les factures Lightning
// sont émises en sats au cours du moment.

// Le franc CFA a une parité fixe avec l'euro.
const XOF_PER_EUR = 655.957;
const MOCK_XOF_PER_BTC = 60_000_000;

let cache: { xofPerBtc: number; at: number } | null = null;

async function xofPerBtc(): Promise<number> {
  if (process.env.PAYMENT_PROVIDER !== "bitnob") return MOCK_XOF_PER_BTC;
  if (cache && Date.now() - cache.at < 60_000) return cache.xofPerBtc;
  const res = await fetch("https://mempool.space/api/v1/prices", { cache: "no-store" });
  if (!res.ok) throw new Error(`Cours BTC indisponible (HTTP ${res.status})`);
  const { EUR } = (await res.json()) as { EUR: number };
  cache = { xofPerBtc: EUR * XOF_PER_EUR, at: Date.now() };
  return cache.xofPerBtc;
}

export async function xofToSats(xof: number) {
  return Math.ceil((xof / (await xofPerBtc())) * 1e8);
}

export const formatXof = (xof: number) => `${xof.toLocaleString("fr-FR")} FCFA`;

// Commission Natt sur chaque versement, en points de base (100 = 1 %).
export const feeBps = () => Number(process.env.NATT_FEE_BPS ?? 50);
export const feeFor = (xof: number) => Math.floor((xof * feeBps()) / 10_000);

// Commission d'un marchand partenaire sur une vente (Natt Marchands).
export const commissionFor = (priceXof: number, commissionBps: number) => Math.floor((priceXof * commissionBps) / 10_000);

// Limites Bitnob pour un versement mobile money au Sénégal (vérifiées le 15/10/2026).
export const MIN_PAYOUT_XOF = 100;
export const MAX_PAYOUT_XOF = 200_000;
