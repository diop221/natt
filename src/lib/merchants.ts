import { randomBytes } from "node:crypto";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { NETWORKS } from "@/lib/format";
import { appUrl, msg } from "@/lib/i18n/notifications";
import { formatXof } from "@/lib/money";
import { notify, tell } from "@/lib/notify";
import { NattError, retryHeldPayouts } from "@/lib/tontine";

// Natt Marchands : des tontines qui financent un achat chez un marchand partenaire
// (mouton de Tabaski, riz, frigo, kit solaire…). Quand un membre doit recevoir sa cagnotte,
// Natt paie directement le marchand au prix Natt, garde la commission du marchand, et verse
// le reste au membre. Le membre ne paie pas de frais Natt sur la partie achat.

export const MERCHANT_CATEGORIES = ["TABASKI", "FOOD", "APPLIANCES", "ENERGY", "BUSINESS"] as const;

// Équipe Natt : les numéros listés dans NATT_ADMIN_PHONES gèrent les marchands et les offres.
export const isNattAdmin = (user: { phone: string } | null) =>
  !!user && (process.env.NATT_ADMIN_PHONES ?? "").split(",").map((p) => p.trim()).filter(Boolean).includes(user.phone);

export async function createMerchant(input: {
  name: string;
  category: string;
  description: string;
  city: string;
  phone: string;
  network: string;
  commissionBps: number;
}) {
  if (!MERCHANT_CATEGORIES.includes(input.category as (typeof MERCHANT_CATEGORIES)[number])) throw new NattError("Catégorie inconnue.");
  if (!(input.network in NETWORKS)) throw new NattError("Réseau inconnu.");
  if (!Number.isInteger(input.commissionBps) || input.commissionBps < 0 || input.commissionBps > 2_000) {
    throw new NattError("La commission doit être comprise entre 0 et 20 %.");
  }
  return db.merchant.create({ data: input });
}

// Le numéro de paiement du marchand est vérifié par l'équipe Natt (contrat signé, appel, test) ;
// les paiements en attente partent alors.
export async function verifyMerchant(merchantId: string) {
  await db.merchant.update({ where: { id: merchantId }, data: { verifiedAt: new Date() } });
  const waiting = await db.payout.findMany({ where: { merchantId, status: "FAILED" }, select: { memberId: true } });
  await retryHeldPayouts([...new Set(waiting.map((p) => p.memberId))]);
}

export async function createOffer(input: {
  merchantId: string;
  title: string;
  description: string;
  priceXof: number;
  nattPriceXof: number;
  delivery: string | null;
}) {
  const merchant = await db.merchant.findUniqueOrThrow({ where: { id: input.merchantId } });
  if (!Number.isInteger(input.priceXof) || !Number.isInteger(input.nattPriceXof) || input.nattPriceXof < 100) {
    throw new NattError("Prix invalide.");
  }
  if (input.nattPriceXof > input.priceXof) throw new NattError("Le prix Natt ne peut pas dépasser le prix public.");
  return db.offer.create({ data: { ...input, category: merchant.category } });
}

export function listOffers(category?: string) {
  return db.offer.findMany({
    where: { active: true, merchant: { active: true }, ...(category && { category }) },
    include: { merchant: true },
    orderBy: [{ category: "asc" }, { nattPriceXof: "asc" }],
  });
}

// Une tontine d'achat : classique (chaque tour achète un article pour son bénéficiaire) ou épargne
// (chacun achète l'article à la fin). Pas de demi-main ni de réserve : chaque versement doit couvrir l'achat.
export async function checkPurchase(input: {
  offerId: string;
  type: string;
  amountXof: number;
  totalRounds?: number;
  halves: number[];
  reserveBps: number;
}) {
  const offer = await db.offer.findUnique({ where: { id: input.offerId }, include: { merchant: true } });
  if (!offer || !offer.active || !offer.merchant.active) throw new NattError("Cette offre n'est plus disponible.");
  if (input.type !== "ROTATING" && input.type !== "SAVINGS") throw new NattError("Un achat se finance avec une tontine classique ou une épargne.");
  if (input.halves.includes(1)) throw new NattError("Pas de demi-main dans une tontine d'achat : chaque tour doit couvrir un article.");
  if (input.reserveBps > 0) throw new NattError("Pas de réserve de fin de cycle dans une tontine d'achat.");
  const perMember =
    input.type === "ROTATING" ? (input.amountXof * input.halves.reduce((s, h) => s + h, 0)) / 2 : input.amountXof * (input.totalRounds ?? 0);
  if (perMember < offer.nattPriceXof) {
    throw new NattError(
      `${input.type === "ROTATING" ? "La cagnotte" : "L'épargne de chacun"} (${formatXof(perMember)}) ne couvre pas le prix Natt de l'offre (${formatXof(offer.nattPriceXof)}).`,
    );
  }
  return offer;
}

export const newOrderToken = () => randomBytes(18).toString("base64url");

// Appelé quand le marchand a été payé.
export async function orderPaid(payoutKey: string) {
  const { count } = await db.order.updateMany({ where: { payoutKey, status: "PAYING" }, data: { status: "PAID" } });
  if (count === 0) return;
  const order = await db.order.findUniqueOrThrow({
    where: { payoutKey },
    include: { offer: true, merchant: true, member: { include: { user: true } }, tontine: true },
  });
  await notify(
    order.merchant.phone,
    msg("fr", "orderMerchant", {
      offer: order.offer.title,
      member: order.member.name,
      phone: order.member.phone,
      amount: formatXof(order.priceXof - order.commissionXof),
      link: appUrl(`/commandes/${order.token}`),
    }),
    `order-merchant:${order.id}`,
  );
  await tell(
    order.member,
    "orderPaid",
    { tontine: order.tontine.name, offer: order.offer.title, merchant: order.merchant.name, delivery: order.offer.delivery ?? "" },
    `order-member:${order.id}`,
  );
  await audit({ tontineId: order.tontineId, memberId: order.memberId, action: "ORDER_PAID", label: `${order.merchant.name} payé pour « ${order.offer.title} » de ${order.member.name}` });
}

// Le marchand indique la livraison depuis le lien reçu par WhatsApp.
export async function markDelivered(token: string) {
  const order = await db.order.findUnique({ where: { token }, include: { member: { include: { user: true } }, offer: true, merchant: true, tontine: true } });
  if (!order) throw new NattError("Commande introuvable.");
  if (order.status === "PAYING") throw new NattError("Le paiement de cette commande n'est pas encore arrivé.");
  const { count } = await db.order.updateMany({ where: { id: order.id, status: "PAID" }, data: { status: "DELIVERED", deliveredAt: new Date() } });
  if (count === 0) return;
  await audit({ tontineId: order.tontineId, memberId: order.memberId, action: "ORDER_DELIVERED", label: `${order.merchant.name} indique avoir livré « ${order.offer.title} » à ${order.member.name}` });
  await tell(
    order.member,
    "orderDelivered",
    { tontine: order.tontine.name, offer: order.offer.title, merchant: order.merchant.name, link: appUrl(`/tontines/${order.tontineId}`) },
    `order-delivered:${order.id}`,
  );
}

// Le membre (ou l'organisateur à sa place) confirme la réception.
export async function confirmReceived(orderId: string, actorId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { member: true, offer: true } });
  const { count } = await db.order.updateMany({
    where: { id: orderId, status: { in: ["PAID", "DELIVERED"] } },
    data: { status: "RECEIVED", receivedAt: new Date() },
  });
  if (count === 0) throw new NattError(order.status === "PAYING" ? "Le marchand n'est pas encore payé." : "Réception déjà confirmée.");
  await audit({ tontineId: order.tontineId, memberId: order.memberId, actorId, action: "ORDER_RECEIVED", label: `Réception de « ${order.offer.title} » confirmée pour ${order.member.name}` });
}
