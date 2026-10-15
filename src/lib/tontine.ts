import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { drawOrder, getChain } from "@/lib/chain";
import { db } from "@/lib/db";
import { NETWORKS } from "@/lib/format";
import { type HandPlan, checkHands, contributionFor, defaultHands, totalHalves } from "@/lib/hands";
import { appUrl, msg, voiceMsg } from "@/lib/i18n/notifications";
import { MIN_PAYOUT_XOF, commissionFor, feeFor, formatXof, xofToSats } from "@/lib/money";
import { notify, sentKeys, tell } from "@/lib/notify";
import { getProvider } from "@/lib/payments";

// Moteur des tontines. Toutes les étapes sont idempotentes : plusieurs pages ouvertes
// peuvent synchroniser en même temps sans créer deux factures ni verser deux fois.

export const TONTINE_TYPES = ["ROTATING", "AUCTION", "SAVINGS", "SOLIDARITY"] as const;
export type TontineType = (typeof TONTINE_TYPES)[number];

// Un type avec bénéficiaire par tour : une place par membre, donc autant de tours que de membres.
export const hasTurns = (type: string) => type === "ROTATING" || type === "AUCTION";

export interface NewTontine {
  name: string;
  type: TontineType;
  amountXof: number;
  frequency: "weekly" | "monthly";
  // halves : part en demi-mains (1, 2 ou 4), seulement pour une tontine classique ; 2 par défaut.
  members: { name: string; phone: string; network: string; sponsorPhone?: string | null; halves?: number }[];
  hands?: HandPlan[]; // tontine classique : ordre des tours (indices des membres) ; par défaut, voir defaultHands
  reserveBps?: number; // réserve de fin de cycle retenue sur chaque cagnotte
  offerId?: string | null; // Natt Marchands : offre achetée pour chaque bénéficiaire
  orderMode: "MANUAL" | "DRAW";
  latePenaltyXof: number;
  guaranteeBps: number;
  totalRounds?: number; // épargne et solidarité : nombre de périodes
  goalLabel?: string | null;
  orgId?: string | null;
  verifyPayouts?: boolean;
}

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function addPeriods(start: Date, frequency: string, n: number) {
  const d = new Date(start);
  if (frequency === "weekly") d.setDate(d.getDate() + 7 * n);
  else d.setMonth(d.getMonth() + n);
  return d;
}

const formatDate = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

// ─── Création ──────────────────────────────────────────────────────────────

// Les numéros doivent déjà être normalisés (voir normalizePhone).
export async function createTontine(ownerId: string, input: NewTontine) {
  const phones = input.members.flatMap((m) => [m.phone, m.sponsorPhone].filter((p): p is string => !!p));
  const users = await db.user.findMany({ where: { phone: { in: phones } }, select: { id: true, phone: true } });
  const userByPhone = new Map(users.map((u) => [u.phone, u.id]));
  // Un numéro déjà prouvé par code (dans une autre tontine, sur le même réseau) reste vérifié.
  const proven = await db.member.findMany({
    where: { phone: { in: input.members.map((m) => m.phone) }, verifiedVia: "OTP" },
    select: { phone: true, network: true },
  });
  const isProven = (m: { phone: string; network: string }) => proven.some((p) => p.phone === m.phone && p.network === m.network);

  const rotating = input.type === "ROTATING";
  const halves = input.members.map((m) => (rotating ? (m.halves ?? 2) : 2));
  const hands = rotating ? (input.hands ?? defaultHands(halves)) : [];
  if (rotating) {
    const error = checkHands(halves, hands);
    if (error) throw new NattError(error);
    if (halves.includes(1) && input.amountXof % 2 !== 0) throw new NattError("Avec des demi-mains, la cotisation doit être un nombre pair.");
  }
  const totalRounds = rotating ? hands.length : input.type === "AUCTION" ? input.members.length : input.totalRounds!;

  if (input.offerId) {
    const { checkPurchase } = await import("@/lib/merchants");
    await checkPurchase({ offerId: input.offerId, type: input.type, amountXof: input.amountXof, totalRounds, halves, reserveBps: input.reserveBps ?? 0 });
  }

  const draw = input.orderMode === "DRAW" && rotating;
  const drawBlockHeight = draw ? (await getChain().tipHeight()) + 1 : null;

  const tontine = await db.$transaction(async (tx) => {
    const created = await tx.tontine.create({
      data: {
        ownerId,
        orgId: input.orgId ?? null,
        name: input.name,
        type: input.type,
        amountXof: input.amountXof,
        frequency: input.frequency,
        totalRounds,
        goalLabel: input.goalLabel ?? null,
        orderMode: draw ? "DRAW" : "MANUAL",
        drawBlockHeight,
        status: draw ? "DRAWING" : "ACTIVE",
        latePenaltyXof: input.latePenaltyXof,
        guaranteeBps: input.type === "SOLIDARITY" ? 0 : input.guaranteeBps,
        verifyPayouts: input.verifyPayouts ?? false,
        reserveBps: hasTurns(input.type) ? (input.reserveBps ?? 0) : 0,
      offerId: input.offerId ?? null,
        members: {
          create: input.members.map((m, i) => ({
            name: m.name,
            phone: m.phone,
            network: m.network,
            position: i + 1,
            userId: userByPhone.get(m.phone),
            sponsorPhone: m.sponsorPhone || null,
            sponsorUserId: m.sponsorPhone ? userByPhone.get(m.sponsorPhone) : undefined,
            halves: halves[i],
            ...(isProven(m) && { verifiedAt: new Date(), verifiedVia: "OTP" }),
          })),
        },
      },
      include: { members: { orderBy: { position: "asc" } } },
    });
    for (const [i, hand] of hands.entries()) {
      await tx.hand.create({
        data: {
          tontineId: created.id,
          position: i + 1,
          holders: { create: hand.map((m) => ({ memberId: created.members[m].id, halves: hand.length === 1 ? 2 : 1 })) },
        },
      });
    }
    return created;
  });
  if (draw) await tryDraw(tontine.id);
  else await openRound(tontine.id, 1);
  return tontine;
}

// Tirage au sort : dès que le bloc choisi à la création est miné, son hash fixe l'ordre de passage.
async function tryDraw(tontineId: string) {
  const tontine = await db.tontine.findUniqueOrThrow({ where: { id: tontineId }, include: { hands: true } });
  if (tontine.status !== "DRAWING" || !tontine.drawBlockHeight) return;
  const hash = await getChain().blockHash(tontine.drawBlockHeight);
  if (!hash) return;

  // Ce sont les mains (tours) qui sont tirées au sort.
  const order = drawOrder(hash, tontine.hands);
  const claimed = await db.$transaction(async (tx) => {
    const { count } = await tx.tontine.updateMany({
      where: { id: tontineId, status: "DRAWING" },
      data: { status: "ACTIVE", drawBlockHash: hash, startAt: new Date() },
    });
    if (count === 0) return false;
    // Deux passes, à cause de la contrainte d'unicité sur (tontine, position).
    for (const [i, h] of order.entries()) await tx.hand.update({ where: { id: h.id }, data: { position: -(i + 1) } });
    for (const [i, h] of order.entries()) await tx.hand.update({ where: { id: h.id }, data: { position: i + 1 } });
    return true;
  });
  if (claimed) await openRound(tontineId, 1);
}

// ─── Tours ─────────────────────────────────────────────────────────────────

// Ouvre un tour : une cotisation (et sa facture) par membre.
// Idempotent : rappelé après une erreur, il ne crée que les cotisations manquantes.
async function openRound(tontineId: string, number: number) {
  const tontine = await db.tontine.findUniqueOrThrow({
    where: { id: tontineId },
    include: { members: { orderBy: { position: "asc" }, include: { user: true, sponsor: true } } },
  });
  // Tontine classique : la main de ce tour. Une demi-main partagée n'a pas de bénéficiaire unique.
  const hand =
    tontine.type === "ROTATING"
      ? await db.hand.findUnique({ where: { tontineId_position: { tontineId, position: number } }, include: { holders: true } })
      : null;
  if (tontine.type === "ROTATING" && !hand) throw new Error(`Aucune main en position ${number}`);
  const beneficiaryId = hand?.holders.length === 1 ? hand.holders[0].memberId : null;

  const round = await db.round.upsert({
    where: { tontineId_number: { tontineId, number } },
    create: {
      tontineId,
      number,
      beneficiaryId,
      handId: hand?.id,
      dueAt: addPeriods(tontine.startAt, tontine.frequency, number),
    },
    update: {},
    include: { contributions: true },
  });

  const provider = getProvider();
  const invoiced = new Set(round.contributions.map((c) => c.memberId));
  for (const member of tontine.members.filter((m) => !invoiced.has(m.id))) {
    const amountXof = contributionFor(tontine.amountXof, member.halves);
    const guaranteeXof = Math.ceil((amountXof * tontine.guaranteeBps) / 10_000);
    const creditUsedXof = Math.min(member.creditXof, amountXof);
    const payable = amountXof - creditUsedXof + guaranteeXof;

    let invoice: { id: string; paymentRequest: string } | null = null;
    let sats = 0;
    if (payable > 0) {
      sats = await xofToSats(payable);
      invoice = await provider.createInvoice({
        sats,
        description: `${tontine.name} · tour ${number} · ${member.name}`,
        reference: `natt-${round.id}-${member.id}`,
      });
    }
    try {
      const created = await db.$transaction(async (tx) => {
        if (creditUsedXof > 0) {
          await tx.member.update({ where: { id: member.id }, data: { creditXof: { decrement: creditUsedXof } } });
        }
        return tx.contribution.create({
          data: {
            roundId: round.id,
            memberId: member.id,
            amountXof,
            guaranteeXof,
            creditUsedXof,
            sats,
            invoiceId: invoice?.id,
            paymentRequest: invoice?.paymentRequest,
            status: invoice ? "pending" : "paid",
            paidAt: invoice ? null : new Date(),
          },
        });
      });
      if (invoice) {
        const vars = {
          tontine: tontine.name,
          round: number,
          amount: formatXof(payable),
          date: formatDate(round.dueAt),
          member: member.name,
          link: appUrl(`/pay/${created.id}`),
        };
        await tell(member, "open", vars, `open:${round.id}:${member.id}`);
        if (member.sponsorPhone) {
          await notify(member.sponsorPhone, msg(member.sponsor?.locale, "sponsorOpen", vars), `open:${round.id}:${member.id}:sponsor`);
        }
      }
    } catch (err) {
      if (!isUniqueViolation(err)) throw err; // une autre synchronisation l'a créée entre-temps
    }
  }
  return round;
}

// ─── Synchronisation ───────────────────────────────────────────────────────

// Appelée par les pages ouvertes et par la tâche planifiée : vérifie les paiements,
// envoie les rappels, applique les pénalités et clôture le tour quand tout est payé.
export async function syncTontine(tontineId: string, now = new Date()) {
  const tontine = await db.tontine.findUniqueOrThrow({
    where: { id: tontineId },
    include: { _count: { select: { members: true } } },
  });
  await syncCharges(tontineId);
  await checkProcessingPayouts({ tontineId });
  if (tontine.status === "DRAWING") return tryDraw(tontineId);
  if (tontine.status !== "ACTIVE") return;

  let round = await db.round.findUnique({
    where: { tontineId_number: { tontineId, number: tontine.currentRound } },
    include: { contributions: true },
  });
  // Tour absent ou incomplet (erreur pendant son ouverture) : on le complète.
  if (!round || round.contributions.length < tontine._count.members) {
    await openRound(tontineId, tontine.currentRound);
    round = await db.round.findUniqueOrThrow({
      where: { tontineId_number: { tontineId, number: tontine.currentRound } },
      include: { contributions: true },
    });
  }
  if (round.status !== "COLLECTING") return;

  const provider = getProvider();
  const pending = round.contributions.filter((c) => c.status === "pending");
  const nowPaid = await Promise.all(
    pending.map(async (c) => {
      const status = await provider.getInvoiceStatus(c.invoiceId!);
      if (status === "paid") return markContributionPaid(c.id, tontine.type);
      if (status === "expired") {
        // Facture expirée : on en émet une nouvelle, le membre peut toujours payer.
        const invoice = await provider.createInvoice({
          sats: await xofToSats(c.amountXof - c.creditUsedXof + c.guaranteeXof),
          description: `${tontine.name} · tour ${round.number}`,
          reference: `natt-${round.id}-${c.memberId}-${Date.now()}`,
        });
        await db.contribution.update({ where: { id: c.id }, data: { invoiceId: invoice.id, paymentRequest: invoice.paymentRequest } });
      }
      return false;
    }),
  );

  const stillPending = pending.filter((_, i) => !nowPaid[i]);
  const fresh = pending.filter((_, i) => nowPaid[i] === "new");
  if (fresh.length > 0) await announcePaid(round, fresh, stillPending.length, tontine.name);
  if (stillPending.length === 0) return closeRound(round.id);
  await handleDeadlines(tontine, round, stillPending, now);
}

async function markContributionPaid(contributionId: string, type: string) {
  return db.$transaction(async (tx) => {
    const { count } = await tx.contribution.updateMany({
      where: { id: contributionId, status: "pending" },
      data: { status: "paid", paidAt: new Date() },
    });
    if (count === 0) return "already" as const;
    const c = await tx.contribution.findUniqueOrThrow({ where: { id: contributionId }, include: { member: true, round: true } });
    // Caisse de solidarité : chaque cotisation alimente la caisse.
    const toFund = c.guaranteeXof + (type === "SOLIDARITY" ? c.amountXof : 0);
    if (toFund > 0) {
      await tx.tontine.update({ where: { id: c.round.tontineId }, data: { fundXof: { increment: toFund } } });
      await tx.fundEntry.create({
        data: {
          tontineId: c.round.tontineId,
          amountXof: toFund,
          reason: type === "SOLIDARITY" ? "CONTRIBUTION" : "GUARANTEE",
          label: `${c.member.name} · tour ${c.round.number}`,
        },
      });
    }
    return "new" as const;
  });
}

// Message vocal aux bénéficiaires du tour qui l'ont choisi : « la cotisation de Moussa est arrivée,
// il en reste deux ». Seulement des informations déjà visibles par tous les membres sur le tableau de bord.
async function announcePaid(round: { id: string; beneficiaryId: string | null; handId: string | null }, paid: { id: string; memberId: string; amountXof: number }[], left: number, tontineName: string) {
  const ids = round.handId
    ? (await db.handHolder.findMany({ where: { handId: round.handId } })).map((h) => h.memberId)
    : round.beneficiaryId
      ? [round.beneficiaryId]
      : [];
  const listeners = await db.member.findMany({ where: { id: { in: ids }, voiceNotes: true } });
  if (listeners.length === 0) return;
  const payers = await db.member.findMany({ where: { id: { in: paid.map((c) => c.memberId) } } });
  for (const c of paid) {
    const payer = payers.find((m) => m.id === c.memberId)!;
    for (const l of listeners.filter((l) => l.id !== c.memberId)) {
      await notify(
        l.phone,
        voiceMsg("confirmed", { name: l.name, tontine: tontineName, member: payer.name, amount: formatXof(c.amountXof), left }),
        `confirmed:${c.id}:${l.id}`,
        "voice",
      );
    }
  }
}

// Pénalités et remboursements : payés, ils alimentent le fonds.
async function syncCharges(tontineId: string) {
  const charges = await db.charge.findMany({ where: { tontineId, status: "pending" }, include: { member: true } });
  const provider = getProvider();
  await Promise.all(
    charges.map(async (ch) => {
      const status = await provider.getInvoiceStatus(ch.invoiceId);
      if (status === "expired") {
        const invoice = await provider.createInvoice({
          sats: await xofToSats(ch.amountXof),
          description: `Natt · ${ch.kind === "PENALTY" ? "pénalité" : "remboursement"} · ${ch.member.name}`,
          reference: `natt-charge-${ch.id}-${Date.now()}`,
        });
        await db.charge.update({ where: { id: ch.id }, data: { invoiceId: invoice.id, paymentRequest: invoice.paymentRequest } });
        return;
      }
      if (status !== "paid") return;
      await db.$transaction(async (tx) => {
        const { count } = await tx.charge.updateMany({ where: { id: ch.id, status: "pending" }, data: { status: "paid", paidAt: new Date() } });
        if (count === 0) return;
        await tx.tontine.update({ where: { id: tontineId }, data: { fundXof: { increment: ch.amountXof } } });
        await tx.fundEntry.create({
          data: {
            tontineId,
            amountXof: ch.amountXof,
            reason: ch.kind,
            label: `${ch.kind === "PENALTY" ? "Pénalité" : "Remboursement"} · ${ch.member.name}`,
          },
        });
      });
    }),
  );
}

// Rappel la veille de l'échéance ; après l'échéance, rappel de retard et pénalité.
async function handleDeadlines(
  tontine: { id: string; name: string; latePenaltyXof: number },
  round: { id: string; dueAt: Date },
  pending: { id: string; memberId: string; amountXof: number; creditUsedXof: number; guaranteeXof: number }[],
  now: Date,
) {
  const dueSoon = now >= new Date(round.dueAt.getTime() - 24 * 3600 * 1000) && now < round.dueAt;
  const late = now >= round.dueAt;
  if (!dueSoon && !late) return;

  const kind = late ? "late" : "due";
  const keys = pending.map((c) => `${kind}:${round.id}:${c.memberId}`);
  const sent = await sentKeys(keys);
  const todo = pending.filter((_, i) => !sent.has(keys[i]));
  if (todo.length === 0) return;

  const members = await db.member.findMany({ where: { id: { in: todo.map((c) => c.memberId) } }, include: { user: true } });
  for (const c of todo) {
    const member = members.find((m) => m.id === c.memberId)!;
    // Membre suspendu (situation exceptionnelle) : ni rappel ni pénalité.
    if (member.suspendedAt) continue;
    let penalty = "";
    if (late && tontine.latePenaltyXof > 0) {
      await createPenalty(tontine.id, member, round.id, tontine.latePenaltyXof);
      penalty = msg(member.user?.locale, "penalty", { amount: formatXof(tontine.latePenaltyXof) });
    }
    const vars = {
      tontine: tontine.name,
      amount: formatXof(c.amountXof - c.creditUsedXof + c.guaranteeXof),
      penalty,
      link: appUrl(`/pay/${c.id}`),
    };
    await tell(member, kind, vars, `${kind}:${round.id}:${member.id}`);
  }
}

async function createPenalty(tontineId: string, member: { id: string; name: string }, roundId: string, amountXof: number) {
  const key = { roundId_memberId_kind: { roundId, memberId: member.id, kind: "PENALTY" } };
  if (await db.charge.findUnique({ where: key })) return;
  const sats = await xofToSats(amountXof);
  const invoice = await getProvider().createInvoice({
    sats,
    description: `Natt · pénalité · ${member.name}`,
    reference: `natt-penalty-${roundId}-${member.id}`,
  });
  try {
    await db.charge.create({
      data: { tontineId, memberId: member.id, roundId, kind: "PENALTY", amountXof, sats, invoiceId: invoice.id, paymentRequest: invoice.paymentRequest },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
}

// ─── Clôture et versements ─────────────────────────────────────────────────

type PlannedPayout = { key: string; memberId: string; amountXof: number; feeXof: number; merchantId?: string };

// Clôture un tour dont toutes les cotisations sont réglées : calcule qui reçoit quoi,
// enregistre les versements, puis les exécute.
async function closeRound(roundId: string) {
  const { count } = await db.round.updateMany({
    where: { id: roundId, status: "COLLECTING" },
    data: { status: "CLOSING", closedAt: new Date() },
  });
  if (count === 0) return;

  const round = await db.round.findUniqueOrThrow({
    where: { id: roundId },
    include: {
      contributions: true,
      bids: { orderBy: [{ amountXof: "desc" }, { updatedAt: "asc" }] },
      hand: { include: { holders: { orderBy: { id: "asc" } } } },
    },
  });
  const tontine = await db.tontine.findUniqueOrThrow({
    where: { id: round.tontineId },
    include: {
      members: { orderBy: { position: "asc" } },
      rounds: { where: { status: "DONE" }, select: { beneficiaryId: true } },
      charges: { where: { status: "pending" }, orderBy: { createdAt: "asc" } },
      offer: { include: { merchant: true } },
    },
  });
  const pot = round.contributions.reduce((sum, c) => sum + c.amountXof, 0);
  const last = round.number >= tontine.totalRounds;
  const payouts: PlannedPayout[] = [];
  const credits = new Map<string, number>();
  const fundMoves: { amountXof: number; reason: string; label: string }[] = [];
  const held = new Map<string, number>(); // réserve retenue sur la cagnotte de ce tour
  const orders: { memberId: string; payoutKey: string; priceXof: number; commissionXof: number }[] = [];
  let beneficiaryId = round.beneficiaryId;
  let bidXof = 0;

  // Ce qu'un membre doit recevoir. Tontine d'achat (Natt Marchands) : le prix Natt part chez le marchand,
  // qui laisse sa commission à Natt ; le membre reçoit le reste, avec les frais Natt sur ce reste seulement.
  const settle = (key: string, memberId: string, xof: number, fee: (cash: number) => number, reserve = 0) => {
    const offer = tontine.offer;
    if (!offer) {
      const f = fee(xof);
      payouts.push({ key, memberId, amountXof: xof - f - reserve, feeXof: f });
      return;
    }
    const commission = commissionFor(offer.nattPriceXof, offer.merchant.commissionBps);
    payouts.push({ key: `order:${key}`, memberId, merchantId: offer.merchantId, amountXof: offer.nattPriceXof - commission, feeXof: commission });
    orders.push({ memberId, payoutKey: `order:${key}`, priceXof: offer.nattPriceXof, commissionXof: commission });
    const cash = xof - offer.nattPriceXof;
    const f = fee(cash);
    if (cash - f >= MIN_PAYOUT_XOF) payouts.push({ key, memberId, amountXof: cash - f, feeXof: f });
    else if (cash > 0) fundMoves.push({ amountXof: cash, reason: "PURCHASE_REMAINDER", label: `Reste après l'achat · tour ${round.number}` });
  };

  if (hasTurns(tontine.type)) {
    if (tontine.type === "AUCTION") {
      // Le plus offrant parmi ceux qui n'ont pas encore reçu ; sans enchère, le premier dans l'ordre.
      const served = new Set(tontine.rounds.map((r) => r.beneficiaryId));
      const eligible = tontine.members.filter((m) => !served.has(m.id));
      const winningBid = last ? undefined : round.bids.find((b) => eligible.some((m) => m.id === b.memberId));
      beneficiaryId = winningBid?.memberId ?? eligible[0].id;
      bidXof = winningBid?.amountXof ?? 0;
      // La remise est partagée entre les autres membres, en crédit sur leurs prochaines cotisations.
      if (bidXof > 0) {
        const others = tontine.members.filter((m) => m.id !== beneficiaryId);
        const share = Math.floor(bidXof / others.length);
        for (const m of others) credits.set(m.id, share);
        const remainder = bidXof - share * others.length;
        if (remainder > 0) {
          fundMoves.push({ amountXof: remainder, reason: "BID_REMAINDER", label: `Reste de l'enchère · tour ${round.number}` });
        }
      }
    }
    const gross = pot - bidXof;
    // Demi-main partagée : chaque titulaire reçoit sa part sur son propre compte.
    const recipients = round.hand && round.hand.holders.length > 1 ? round.hand.holders : [{ memberId: beneficiaryId!, halves: 2 }];
    const halvesSum = recipients.reduce((s, r) => s + r.halves, 0);
    let left = gross;
    recipients.forEach((r, i) => {
      const share = i === recipients.length - 1 ? left : Math.floor((gross * r.halves) / halvesSum);
      left -= share;
      // La réserve de fin de cycle n'est pas un revenu de Natt : elle est rendue au membre à la fin.
      const reserve = Math.floor((share * tontine.reserveBps) / 10_000);
      if (reserve > 0) held.set(r.memberId, reserve);
      settle(recipients.length === 1 ? `round:${round.id}` : `round:${round.id}:${r.memberId}`, r.memberId, share, feeFor, reserve);
    });
  }

  const reserveLeft = new Map<string, number>();
  const settled: { id: string; memberId: string; amountXof: number }[] = [];
  const released = new Map<string, number>();
  if (last) {
    // Fin de la tontine : chacun récupère son épargne, ses crédits restants, sa part du fonds et sa réserve.
    const owed = new Map<string, number>();
    const add = (id: string, xof: number) => owed.set(id, (owed.get(id) ?? 0) + xof);
    if (tontine.type === "SAVINGS") {
      const all = await db.contribution.findMany({ where: { round: { tontineId: tontine.id } } });
      for (const c of all) add(c.memberId, c.amountXof);
    }
    for (const m of tontine.members) {
      const credit = m.creditXof + (credits.get(m.id) ?? 0);
      if (credit > 0) add(m.id, credit);
    }
    credits.clear();
    // La réserve règle d'abord ce que le membre doit encore (pénalités, avances du fonds) ; le reste lui est rendu.
    for (const m of tontine.members) {
      let reserve = m.reserveXof + (held.get(m.id) ?? 0);
      if (reserve <= 0) continue;
      for (const ch of tontine.charges.filter((c) => c.memberId === m.id)) {
        if (ch.amountXof > reserve) continue;
        reserve -= ch.amountXof;
        settled.push({ id: ch.id, memberId: m.id, amountXof: ch.amountXof });
        fundMoves.push({
          amountXof: ch.amountXof,
          reason: ch.kind,
          label: `${ch.kind === "PENALTY" ? "Pénalité" : "Remboursement"} · ${m.name} (réglé par sa réserve)`,
        });
      }
      if (reserve >= MIN_PAYOUT_XOF) {
        released.set(m.id, reserve);
        payouts.push({ key: `reserve:${tontine.id}:${m.id}`, memberId: m.id, amountXof: reserve, feeXof: 0 });
        reserve = 0;
      }
      reserveLeft.set(m.id, reserve);
    }
    // Le fonds est partagé selon la part de chacun (une double main compte double).
    const fund = tontine.fundXof + fundMoves.reduce((s, f) => s + f.amountXof, 0);
    const halvesAll = totalHalves(tontine.members.map((m) => m.halves));
    const shares = tontine.members.map((m) => Math.floor((fund * m.halves) / halvesAll));
    if (Math.min(...shares) >= MIN_PAYOUT_XOF) {
      tontine.members.forEach((m, i) => add(m.id, shares[i]));
      fundMoves.push({ amountXof: -shares.reduce((s, x) => s + x, 0), reason: "CLOSING", label: "Partage du fonds à la fin de la tontine" });
    }
    for (const [memberId, xof] of owed) {
      // En dessous du minimum de versement, le reste demeure dans le fonds.
      if (xof < MIN_PAYOUT_XOF) continue;
      settle(`final:${tontine.id}:${memberId}`, memberId, xof, (cash) => (tontine.type === "SAVINGS" ? feeFor(cash) : 0));
    }
  }

  const pct = (tontine.reserveBps / 100).toLocaleString("fr-FR");
  await db.$transaction(async (tx) => {
    await tx.round.update({
      where: { id: round.id },
      data: {
        beneficiaryId,
        bidXof,
        feeXof: payouts.reduce((s, p) => s + p.feeXof, 0),
        status: payouts.length ? "PAYING_OUT" : "DONE",
      },
    });
    for (const [memberId, xof] of credits) {
      await tx.member.update({ where: { id: memberId }, data: { creditXof: { increment: xof } } });
    }
    if (last) await tx.member.updateMany({ where: { tontineId: tontine.id }, data: { creditXof: 0 } });
    for (const [memberId, xof] of held) {
      await tx.member.update({ where: { id: memberId }, data: { reserveXof: { increment: xof } } });
      await tx.reserveEntry.create({
        data: { tontineId: tontine.id, memberId, amountXof: xof, reason: "HOLD", label: `Retenue de ${pct} % sur la cagnotte du tour ${round.number}` },
      });
    }
    for (const ch of settled) {
      await tx.charge.update({ where: { id: ch.id }, data: { status: "paid", paidAt: new Date() } });
      await tx.reserveEntry.create({
        data: { tontineId: tontine.id, memberId: ch.memberId, amountXof: -ch.amountXof, reason: "SETTLE", label: "Dette réglée par la réserve à la fin du cycle" },
      });
    }
    for (const [memberId, xof] of released) {
      await tx.reserveEntry.create({
        data: { tontineId: tontine.id, memberId, amountXof: -xof, reason: "RELEASE", label: "Réserve rendue à la fin du cycle" },
      });
    }
    for (const [memberId, xof] of reserveLeft) await tx.member.update({ where: { id: memberId }, data: { reserveXof: xof } });
    for (const f of fundMoves) {
      await tx.tontine.update({ where: { id: tontine.id }, data: { fundXof: { increment: f.amountXof } } });
      await tx.fundEntry.create({ data: { tontineId: tontine.id, ...f } });
    }
    await tx.payout.createMany({
      data: payouts.map((p) => ({ ...p, tontineId: tontine.id, roundId: round.id })),
      skipDuplicates: true,
    });
    for (const o of orders) {
      await tx.order.create({
        data: { ...o, token: randomBytes(18).toString("base64url"), tontineId: tontine.id, offerId: tontine.offer!.id, merchantId: tontine.offer!.merchantId },
      });
    }
  });

  if (payouts.length) await processRoundPayouts(round.id);
  else await advance(tontine.id, round.number);
}

// Exécute les versements en attente (ou échoués) d'un tour ; s'ils sont tous faits, passe au tour suivant.
export async function processRoundPayouts(roundId: string) {
  const pending = await db.payout.findMany({ where: { roundId, status: { in: ["PENDING", "FAILED"] } } });
  for (const p of pending) await executePayout(p.id);
  await refreshRoundStatus(roundId);
}

// Tour versé quand tous ses versements sont payés (on passe alors au suivant) ; en échec si l'un a échoué.
// Les versements en cours de règlement (PROCESSING) laissent le tour en attente.
async function refreshRoundStatus(roundId: string) {
  const round = await db.round.findUniqueOrThrow({ where: { id: roundId }, include: { payouts: true } });
  if (round.payouts.every((p) => p.status === "PAID")) {
    const { count } = await db.round.updateMany({
      where: { id: roundId, status: { in: ["PAYING_OUT", "PAYOUT_FAILED"] } },
      data: { status: "DONE" },
    });
    if (count === 1) await advance(round.tontineId, round.number);
  } else if (round.payouts.some((p) => p.status === "FAILED")) {
    await db.round.updateMany({ where: { id: roundId, status: "PAYING_OUT" }, data: { status: "PAYOUT_FAILED" } });
  }
}

// Un versement reste bloqué (en échec, avec un message clair) vers un numéro non vérifié, ou vers un
// membre suspendu pour une situation exceptionnelle. Il repart tout seul dès que la cause est levée
// (voir retryHeldPayouts).
const UNVERIFIED_END = " non vérifié : le versement partira dès qu'il sera confirmé.";
const SUSPENDED_END = " : situation exceptionnelle en cours, le versement partira quand elle sera réglée.";
export const blockedPayoutError = (memberName: string) => `Numéro de ${memberName}${UNVERIFIED_END}`;
export const suspendedPayoutError = (memberName: string) => `Versement à ${memberName} suspendu${SUSPENDED_END}`;
const MERCHANT_END = " : numéro de paiement pas encore vérifié par Natt.";
const merchantPayoutError = (merchantName: string) => `Marchand ${merchantName}${MERCHANT_END}`;
const isHeldError = (error: string | null) =>
  !!error && (error.endsWith(UNVERIFIED_END) || error.endsWith(SUSPENDED_END) || error.endsWith(MERCHANT_END));

// Pourquoi un versement à ce membre ne peut pas partir, ou null. Une place reprise par un ayant droit
// exige toujours un numéro vérifié, même si la tontine ne l'exige pas pour les autres.
// Pour un achat, c'est le numéro du marchand qui doit être vérifié (par Natt), pas celui du membre.
function holdReason(
  tontine: { verifyPayouts: boolean },
  member: { name: string; verifiedAt: Date | null; suspendedAt: Date | null; transferredAt: Date | null },
  merchant?: { name: string; verifiedAt: Date | null } | null,
) {
  if (member.suspendedAt) return suspendedPayoutError(member.name);
  if (merchant) return merchant.verifiedAt ? null : merchantPayoutError(merchant.name);
  if ((tontine.verifyPayouts || member.transferredAt) && !member.verifiedAt) return blockedPayoutError(member.name);
  return null;
}

async function holdPayout(payoutId: string) {
  const p = await db.payout.findUniqueOrThrow({
    where: { id: payoutId },
    include: { member: true, merchant: true, tontine: { include: { owner: true } } },
  });
  const error = holdReason(p.tontine, p.member, p.merchant);
  if (!error) return false;
  // Le premier blocage est journalisé et signalé à l'organisateur ; les suivants ne font rien.
  const { count } = await db.payout.updateMany({
    where: { id: p.id, status: { in: ["PENDING", "FAILED"] }, OR: [{ error: null }, { error: { not: error } }] },
    data: { status: "FAILED", error },
  });
  if (count === 1 && p.merchant && !p.member.suspendedAt) {
    await audit({ tontineId: p.tontineId, memberId: p.memberId, action: "PAYOUT_BLOCKED", label: `Paiement de ${formatXof(p.amountXof)} au marchand ${p.merchant.name} en attente : numéro non vérifié par Natt` });
  } else if (count === 1 && !p.member.suspendedAt) {
    await audit({ tontineId: p.tontineId, memberId: p.memberId, action: "PAYOUT_BLOCKED", label: `Versement de ${formatXof(p.amountXof)} à ${p.member.name} bloqué : numéro non vérifié` });
    await notify(
      p.tontine.owner.phone,
      msg(p.tontine.owner.locale, "payoutBlocked", {
        tontine: p.tontine.name,
        amount: formatXof(p.amountXof),
        member: p.member.name,
        link: appUrl(`/tontines/${p.tontineId}`),
      }),
      `blocked:${p.id}`,
    );
  } else if (count === 1) {
    await audit({ tontineId: p.tontineId, memberId: p.memberId, action: "PAYOUT_HELD", label: `Versement de ${formatXof(p.amountXof)} à ${p.member.name} suspendu : situation exceptionnelle en cours` });
  }
  return true;
}

// Relance les versements bloqués d'un membre une fois la cause levée (les autres échecs restent à relancer à la main).
export async function retryHeldPayouts(memberIds: string[]) {
  const failed = await db.payout.findMany({ where: { memberId: { in: memberIds }, status: "FAILED" } });
  const rounds = new Set<string>();
  for (const p of failed.filter((p) => isHeldError(p.error))) {
    if (p.roundId) rounds.add(p.roundId);
    else await executePayout(p.id);
  }
  for (const roundId of rounds) await processRoundPayouts(roundId);
}

export async function executePayout(payoutId: string) {
  if (await holdPayout(payoutId)) return;
  const { count } = await db.payout.updateMany({
    where: { id: payoutId, status: { in: ["PENDING", "FAILED"] } },
    data: { status: "SENDING", error: null },
  });
  if (count === 0) return;
  const p = await db.payout.findUniqueOrThrow({
    where: { id: payoutId },
    include: { member: { include: { user: true } }, tontine: true, merchant: true },
  });
  // Le numéro (ou la situation du membre) a pu changer entre la vérification ci-dessus et la prise du versement.
  const held = holdReason(p.tontine, p.member, p.merchant);
  if (held) {
    await db.payout.update({ where: { id: p.id }, data: { status: "FAILED", error: held } });
    return;
  }
  let result: Awaited<ReturnType<ReturnType<typeof getProvider>["payout"]>>;
  try {
    result = await getProvider().payout({
      amountXof: p.amountXof,
      reference: `natt-${p.id}-${Date.now()}`,
      beneficiary: p.merchant
        ? { name: p.merchant.name, phone: p.merchant.phone, network: p.merchant.network }
        : { name: p.member.name, phone: p.member.phone, network: p.member.network },
    });
  } catch (err) {
    await db.payout.update({ where: { id: p.id }, data: { status: "FAILED", error: errorMessage(err) } });
    return;
  }
  // Accepté mais pas encore réglé : on attend la confirmation (webhook ou checkProcessingPayouts).
  if (result.status === "COMPLETED") await settlePayout(p.id, result.id);
  else await db.payout.update({ where: { id: p.id }, data: { status: "PROCESSING", providerId: result.id } });
}

// Versement confirmé par le fournisseur : marqué payé, puis notifications et suites (commande, demande).
// Idempotent ; une erreur de notification ne remet jamais en cause un versement déjà parti.
async function settlePayout(payoutId: string, providerId?: string) {
  const { count } = await db.payout.updateMany({
    where: { id: payoutId, status: { in: ["SENDING", "PROCESSING"] } },
    data: { status: "PAID", paidAt: new Date(), ...(providerId && { providerId }) },
  });
  if (count === 0) return;
  const p = await db.payout.findUniqueOrThrow({ where: { id: payoutId }, include: { member: { include: { user: true } }, tontine: true } });
  if (p.requestId) await db.solidarityRequest.update({ where: { id: p.requestId }, data: { status: "PAID" } });
  // Achat : la commande passe à « payée » et le marchand est prévenu (import tardif : merchants.ts dépend de ce module).
  if (p.merchantId) await (await import("@/lib/merchants")).orderPaid(p.key);
  else {
    await tell(
      p.member,
      p.key.startsWith("reserve:") ? "reserveReleased" : "payout",
      { tontine: p.tontine.name, amount: formatXof(p.amountXof), network: NETWORKS[p.member.network] ?? p.member.network },
      `payout:${p.id}`,
    );
  }
}

// Versements acceptés par le fournisseur mais pas encore réglés : on lui demande où ils en sont
// (en complément des webhooks, comme le recommande Bitnob).
export async function checkProcessingPayouts(where: Prisma.PayoutWhereInput = {}) {
  const processing = await db.payout.findMany({ where: { ...where, status: "PROCESSING", providerId: { not: null } } });
  for (const p of processing) {
    const status = await getProvider()
      .getPayoutStatus(p.providerId!)
      .catch(() => "pending" as const);
    if (status === "pending") continue;
    if (status === "paid") await settlePayout(p.id);
    else {
      await db.payout.updateMany({
        where: { id: p.id, status: "PROCESSING" },
        data: { status: "FAILED", error: "Versement refusé ou expiré chez l'opérateur : relancez-le." },
      });
    }
    if (p.roundId) await refreshRoundStatus(p.roundId);
  }
}

async function advance(tontineId: string, number: number) {
  const tontine = await db.tontine.findUniqueOrThrow({ where: { id: tontineId } });
  if (number >= tontine.totalRounds) {
    await db.tontine.updateMany({ where: { id: tontineId, status: "ACTIVE" }, data: { status: "COMPLETED" } });
    return;
  }
  const { count } = await db.tontine.updateMany({
    where: { id: tontineId, currentRound: number },
    data: { currentRound: number + 1 },
  });
  if (count === 1) await openRound(tontineId, number + 1);
}

// ─── Actions des membres et de l'organisateur ──────────────────────────────

// Erreur à afficher telle quelle à l'utilisateur.
export class NattError extends Error {}

// Le fonds de garantie avance la cotisation d'un membre en retard ; le membre la rembourse
// ensuite avec la même facture.
export async function coverContribution(contributionId: string, now = new Date()) {
  const c = await db.contribution.findUniqueOrThrow({
    where: { id: contributionId },
    include: { round: { include: { tontine: true } }, member: true },
  });
  const { tontine } = c.round;
  if (tontine.type === "SOLIDARITY") throw new NattError("La caisse de solidarité ne peut pas avancer de cotisation.");
  if (c.status !== "pending") throw new NattError("Cette cotisation n'est plus en attente.");
  if (now < c.round.dueAt) throw new NattError("Le fonds ne peut avancer une cotisation qu'après l'échéance.");
  const advanced = c.amountXof - c.creditUsedXof;

  await db.$transaction(async (tx) => {
    const updated = await tx.contribution.updateMany({ where: { id: c.id, status: "pending" }, data: { status: "covered" } });
    if (updated.count === 0) throw new NattError("Cette cotisation n'est plus en attente.");
    const funded = await tx.tontine.updateMany({
      where: { id: tontine.id, fundXof: { gte: advanced } },
      data: { fundXof: { decrement: advanced } },
    });
    if (funded.count === 0) throw new NattError("Le fonds de garantie n'est pas suffisant.");
    await tx.fundEntry.create({
      data: { tontineId: tontine.id, amountXof: -advanced, reason: "COVER", label: `Avance pour ${c.member.name} · tour ${c.round.number}` },
    });
    await tx.charge.create({
      data: {
        tontineId: tontine.id,
        memberId: c.memberId,
        roundId: c.roundId,
        kind: "REPAYMENT",
        amountXof: advanced + c.guaranteeXof,
        sats: c.sats,
        invoiceId: c.invoiceId!,
        paymentRequest: c.paymentRequest!,
      },
    });
  });
  await syncTontine(tontine.id, now);
}

// Rappel manuel envoyé par l'organisateur, au plus une fois par heure et par membre.
export async function sendReminders(tontineId: string, ownerName: string) {
  const tontine = await db.tontine.findUniqueOrThrow({ where: { id: tontineId } });
  const round = await db.round.findUnique({
    where: { tontineId_number: { tontineId, number: tontine.currentRound } },
    include: { contributions: { where: { status: "pending" }, include: { member: { include: { user: true } } } } },
  });
  if (!round) return 0;
  const hour = new Date().toISOString().slice(0, 13);
  for (const c of round.contributions) {
    const vars = {
      tontine: tontine.name,
      owner: ownerName,
      amount: formatXof(c.amountXof - c.creditUsedXof + c.guaranteeXof),
      link: appUrl(`/pay/${c.id}`),
    };
    await notify(c.member.phone, msg(c.member.user?.locale, "reminder", vars), `reminder:${c.id}:${hour}`);
  }
  return round.contributions.length;
}

// Annonce de l'organisateur à tous les membres : par écrit, et en vocal pour ceux qui l'ont choisi.
export async function sendAnnouncement(tontineId: string, text: string, actor: { id: string; name: string }) {
  const body = text.trim().slice(0, 500);
  if (!body) throw new NattError("Écrivez le message.");
  const tontine = await db.tontine.findUniqueOrThrow({ where: { id: tontineId }, include: { members: { include: { user: true } } } });
  for (const m of tontine.members) await tell(m, "announcement", { tontine: tontine.name, owner: actor.name, text: body });
  await audit({ tontineId, actorId: actor.id, action: "ANNOUNCEMENT", label: `${actor.name} envoie une annonce : « ${body.slice(0, 80)}${body.length > 80 ? "…" : ""} »` });
  return tontine.members.length;
}

// Messages vocaux en wolof pour un membre (choisi par lui-même ou par l'organisateur, qui connaît ses membres).
export async function setVoiceNotes(memberId: string, on: boolean, actorId: string) {
  const m = await db.member.update({ where: { id: memberId }, data: { voiceNotes: on } });
  await audit({ tontineId: m.tontineId, memberId, actorId, action: "VOICE_NOTES", label: `Messages vocaux en wolof ${on ? "activés" : "désactivés"} pour ${m.name}` });
}

export async function placeBid(roundId: string, memberId: string, amountXof: number) {
  const round = await db.round.findUniqueOrThrow({
    where: { id: roundId },
    include: {
      tontine: {
        include: { rounds: { where: { status: "DONE" }, select: { beneficiaryId: true } }, _count: { select: { members: true } } },
      },
    },
  });
  const { tontine } = round;
  if (tontine.type !== "AUCTION") throw new NattError("Les enchères ne concernent que les tontines à enchères.");
  if (round.status !== "COLLECTING") throw new NattError("Les enchères de ce tour sont closes.");
  if (round.number >= tontine.totalRounds) throw new NattError("Pas d'enchère au dernier tour : il ne reste qu'un membre.");
  if (tontine.rounds.some((r) => r.beneficiaryId === memberId)) throw new NattError("Vous avez déjà reçu la cagnotte.");
  const maxBid = Math.floor((tontine.amountXof * tontine._count.members) / 2);
  if (!Number.isInteger(amountXof) || amountXof < 1 || amountXof > maxBid) {
    throw new NattError(`L'enchère doit être comprise entre 1 et ${formatXof(maxBid)}.`);
  }
  return db.bid.upsert({
    where: { roundId_memberId: { roundId, memberId } },
    create: { roundId, memberId, amountXof },
    update: { amountXof },
  });
}

export async function createSolidarityRequest(
  memberId: string,
  input: { reason: string; description: string; amountXof: number },
) {
  const member = await db.member.findUniqueOrThrow({ where: { id: memberId }, include: { tontine: { include: { owner: true } } } });
  if (member.tontine.type !== "SOLIDARITY") throw new NattError("Les demandes ne concernent que les caisses de solidarité.");
  const request = await db.solidarityRequest.create({ data: { tontineId: member.tontineId, memberId, ...input } });
  await notify(
    member.tontine.owner.phone,
    msg(member.tontine.owner.locale, "requestNew", {
      tontine: member.tontine.name,
      member: member.name,
      amount: formatXof(input.amountXof),
      reason: input.description,
      link: appUrl(`/tontines/${member.tontineId}`),
    }),
    `request:${request.id}`,
  );
  return request;
}

export async function decideSolidarityRequest(requestId: string, approve: boolean) {
  const req = await db.solidarityRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { member: { include: { user: true } }, tontine: true },
  });
  if (req.status !== "PENDING") throw new NattError("Cette demande a déjà été traitée.");
  const vars = { tontine: req.tontine.name, amount: formatXof(req.amountXof) };

  if (!approve) {
    const { count } = await db.solidarityRequest.updateMany({
      where: { id: req.id, status: "PENDING" },
      data: { status: "REJECTED", decidedAt: new Date() },
    });
    if (count === 1) await notify(req.member.phone, msg(req.member.user?.locale, "requestRejected", vars), `request-decided:${req.id}`);
    return;
  }
  const payout = await db.$transaction(async (tx) => {
    const updated = await tx.solidarityRequest.updateMany({
      where: { id: req.id, status: "PENDING" },
      data: { status: "APPROVED", decidedAt: new Date() },
    });
    if (updated.count === 0) throw new NattError("Cette demande a déjà été traitée.");
    const funded = await tx.tontine.updateMany({
      where: { id: req.tontineId, fundXof: { gte: req.amountXof } },
      data: { fundXof: { decrement: req.amountXof } },
    });
    if (funded.count === 0) throw new NattError("La caisse n'a pas assez de fonds pour cette demande.");
    await tx.fundEntry.create({
      data: { tontineId: req.tontineId, amountXof: -req.amountXof, reason: "REQUEST", label: `${req.member.name} · ${req.description}` },
    });
    return tx.payout.create({
      data: { key: `request:${req.id}`, tontineId: req.tontineId, memberId: req.memberId, requestId: req.id, amountXof: req.amountXof },
    });
  });
  await notify(req.member.phone, msg(req.member.user?.locale, "requestApproved", vars), `request-decided:${req.id}`);
  await executePayout(payout.id);
}

// ─── Lecture ───────────────────────────────────────────────────────────────

export function getTontine(id: string) {
  return db.tontine.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true } },
      org: { select: { id: true, name: true } },
      members: { orderBy: { position: "asc" } },
      rounds: {
        orderBy: { number: "asc" },
        include: {
          beneficiary: true,
          contributions: { include: { member: true } },
          bids: { include: { member: true }, orderBy: [{ amountXof: "desc" }, { updatedAt: "asc" }] },
        },
      },
      payouts: { include: { member: true }, orderBy: { createdAt: "asc" } },
      charges: { include: { member: true }, orderBy: { createdAt: "asc" } },
      fundEntries: { orderBy: { createdAt: "desc" }, take: 30 },
      requests: { include: { member: true }, orderBy: { createdAt: "desc" } },
      swaps: { include: { requester: true, partner: true }, orderBy: { createdAt: "desc" }, take: 10 },
      hands: { orderBy: { position: "asc" }, include: { holders: { include: { member: true }, orderBy: { id: "asc" } } } },
      incidents: { include: { member: true }, orderBy: { createdAt: "desc" } },
      reserveEntries: { include: { member: true }, orderBy: { createdAt: "desc" }, take: 30 },
      offer: { include: { merchant: true } },
      orders: { include: { member: true }, orderBy: { createdAt: "asc" } },
      audit: { orderBy: { createdAt: "desc" }, take: 30 },
    },
  });
}

export type TontineDetail = NonNullable<Awaited<ReturnType<typeof getTontine>>>;
