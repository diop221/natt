import { canManageTontine } from "@/lib/access";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { appUrl, msg } from "@/lib/i18n/notifications";
import { notify, tell } from "@/lib/notify";
import { NattError, addPeriods } from "@/lib/tontine";

// Échange de tours dans une tontine classique (ROTATING) : on échange deux mains (voir hands.ts),
// dont la position est le numéro du tour où elles reçoivent la cagnotte. Une demi-main partagée
// ne s'échange pas : il faudrait l'accord de ses deux titulaires.
//   1. un membre propose une de ses mains contre celle d'un autre ;
//   2. le partenaire accepte ou refuse ;
//   3. l'organisateur (ou le bureau) valide, puis le calendrier est mis à jour.
// L'étape 3 est implicite quand l'un des deux gère lui-même la tontine.
// Chaque étape est horodatée dans le journal de la tontine.

const PENDING = ["PENDING_PARTNER", "PENDING_ORGANIZER"];

const formatDate = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

// Une position est encore échangeable si son tour n'est pas passé et, pour le tour en cours,
// tant que la cagnotte n'est pas en train d'être versée.
async function checkOpen(tontineId: string, positions: number[]) {
  const t = await db.tontine.findUniqueOrThrow({ where: { id: tontineId } });
  if (t.type !== "ROTATING") throw new NattError("L'échange de tours ne concerne que les tontines classiques.");
  if (t.status !== "ACTIVE") throw new NattError("La tontine n'est pas en cours.");
  if (positions.some((p) => p < t.currentRound)) throw new NattError("Ce tour a déjà été versé.");
  if (positions.includes(t.currentRound)) {
    const round = await db.round.findUnique({ where: { tontineId_number: { tontineId, number: t.currentRound } } });
    if (round && round.status !== "COLLECTING") throw new NattError("La cagnotte du tour en cours est en train d'être versée.");
  }
  return t;
}

async function pendingFor(handIds: string[]) {
  return db.turnSwap.findFirst({
    where: { status: { in: PENDING }, OR: [{ requesterHandId: { in: handIds } }, { partnerHandId: { in: handIds } }] },
  });
}

// Le titulaire unique d'une main, ou une erreur si la main est partagée.
function soleHolder(hand: { holders: { memberId: string }[] }) {
  if (hand.holders.length !== 1) throw new NattError("Une demi-main partagée ne peut pas être échangée.");
  return hand.holders[0].memberId;
}

export async function requestSwap(requesterHandId: string, partnerHandId: string, requesterId: string, actorId: string) {
  const [ha, hb] = await Promise.all([
    db.hand.findUniqueOrThrow({ where: { id: requesterHandId }, include: { holders: true } }),
    db.hand.findUniqueOrThrow({ where: { id: partnerHandId }, include: { holders: true } }),
  ]);
  if (ha.tontineId !== hb.tontineId) throw new NattError("Ce tour ne fait pas partie de la tontine.");
  if (soleHolder(ha) !== requesterId) throw new NattError("Vous ne pouvez proposer que votre propre tour.");
  const partnerId = soleHolder(hb);
  if (partnerId === requesterId) throw new NattError("Choisissez le tour d'un autre membre.");
  const t = await checkOpen(ha.tontineId, [ha.position, hb.position]);
  if (await pendingFor([ha.id, hb.id])) throw new NattError("Une demande d'échange est déjà en cours pour l'un de ces tours.");
  const [a, b] = await Promise.all([
    db.member.findUniqueOrThrow({ where: { id: requesterId } }),
    db.member.findUniqueOrThrow({ where: { id: partnerId }, include: { user: true } }),
  ]);

  const swap = await db.turnSwap.create({
    data: {
      tontineId: t.id,
      requesterId,
      partnerId,
      requesterHandId: ha.id,
      partnerHandId: hb.id,
      requesterPosition: ha.position,
      partnerPosition: hb.position,
    },
  });
  await audit({
    tontineId: t.id,
    memberId: a.id,
    actorId,
    action: "SWAP_REQUESTED",
    label: `${a.name} demande à ${b.name} d'échanger le tour ${ha.position} contre le tour ${hb.position}`,
  });
  await notify(
    b.phone,
    msg(b.user?.locale, "swapRequest", { tontine: t.name, member: a.name, from: ha.position, to: hb.position, link: appUrl(`/tontines/${t.id}`) }),
    `swap:${swap.id}`,
  );
  return swap;
}

export async function answerSwap(swapId: string, partnerId: string, accept: boolean, actorId: string) {
  const swap = await db.turnSwap.findUniqueOrThrow({
    where: { id: swapId },
    include: { requester: { include: { user: true } }, partner: true, tontine: { include: { owner: true } } },
  });
  if (swap.partnerId !== partnerId) throw new NattError("Cette demande ne vous est pas adressée.");
  const { count } = await db.turnSwap.updateMany({
    where: { id: swapId, status: "PENDING_PARTNER" },
    data: { status: accept ? "PENDING_ORGANIZER" : "REFUSED", answeredAt: new Date() },
  });
  if (count === 0) throw new NattError("Cette demande a déjà été traitée.");
  const { requester: a, partner: b, tontine: t } = swap;
  await audit({
    tontineId: t.id,
    memberId: b.id,
    actorId,
    action: accept ? "SWAP_ACCEPTED" : "SWAP_REFUSED",
    label: `${b.name} ${accept ? "accepte" : "refuse"} l'échange avec ${a.name}`,
  });
  if (!accept) {
    await notify(a.phone, msg(a.user?.locale, "swapDeclined", { tontine: t.name, member: b.name }), `swap-declined:${swap.id}`);
    return;
  }
  // L'un des deux gère la tontine : sa demande ou son accord vaut validation.
  const managers = await Promise.all([a.userId, b.userId].map((u) => (u ? canManageTontine(u, t.id) : false)));
  if (managers.some(Boolean)) return applySwap(swapId, null);
  await notify(
    t.owner.phone,
    msg(t.owner.locale, "swapToOrganizer", {
      tontine: t.name,
      a: a.name,
      b: b.name,
      from: swap.requesterPosition,
      to: swap.partnerPosition,
      link: appUrl(`/tontines/${t.id}`),
    }),
    `swap-organizer:${swap.id}`,
  );
}

// Décision de l'organisateur (appelant déjà autorisé à gérer la tontine).
export async function decideSwap(swapId: string, approve: boolean, actorId: string, actorName: string) {
  const swap = await db.turnSwap.findUniqueOrThrow({ where: { id: swapId }, include: { requester: { include: { user: true } }, partner: true } });
  if (swap.status !== "PENDING_ORGANIZER") {
    throw new NattError(swap.status === "PENDING_PARTNER" ? "Le membre concerné n'a pas encore répondu." : "Cette demande a déjà été traitée.");
  }
  if (approve) return applySwap(swapId, actorId, actorName);
  const { count } = await db.turnSwap.updateMany({ where: { id: swapId, status: "PENDING_ORGANIZER" }, data: { status: "REJECTED", decidedAt: new Date() } });
  if (count === 0) throw new NattError("Cette demande a déjà été traitée.");
  await audit({
    tontineId: swap.tontineId,
    actorId,
    action: "SWAP_REJECTED",
    label: `${actorName} refuse l'échange entre ${swap.requester.name} et ${swap.partner.name}`,
  });
  const t = await db.tontine.findUniqueOrThrow({ where: { id: swap.tontineId } });
  await notify(
    swap.requester.phone,
    msg(swap.requester.user?.locale, "swapDeclined", { tontine: t.name, member: swap.partner.name }),
    `swap-declined:${swap.id}`,
  );
}

export async function cancelSwap(swapId: string, requesterId: string, actorId: string) {
  const swap = await db.turnSwap.findUniqueOrThrow({ where: { id: swapId }, include: { requester: true, partner: true } });
  if (swap.requesterId !== requesterId) throw new NattError("Seul l'auteur de la demande peut l'annuler.");
  const { count } = await db.turnSwap.updateMany({ where: { id: swapId, status: { in: PENDING } }, data: { status: "CANCELLED", decidedAt: new Date() } });
  if (count === 0) throw new NattError("Cette demande a déjà été traitée.");
  await audit({
    tontineId: swap.tontineId,
    memberId: requesterId,
    actorId,
    action: "SWAP_CANCELLED",
    label: `${swap.requester.name} annule sa demande d'échange avec ${swap.partner.name}`,
  });
}

// Applique l'échange : tout est revérifié dans une transaction qui verrouille la tontine,
// pour qu'un passage au tour suivant ne puisse pas se glisser entre la vérification et l'échange.
async function applySwap(swapId: string, actorId: string | null, actorName?: string) {
  const result = await db.$transaction(async (tx) => {
    const { tontineId } = await tx.turnSwap.findUniqueOrThrow({ where: { id: swapId } });
    await tx.$queryRaw`SELECT id FROM "Tontine" WHERE id = ${tontineId} FOR UPDATE`;
    // Relu après le verrou : deux validations simultanées ne peuvent pas appliquer l'échange deux fois.
    const swap = await tx.turnSwap.findUniqueOrThrow({ where: { id: swapId } });
    if (swap.status !== "PENDING_ORGANIZER") throw new NattError("Cette demande a déjà été traitée.");
    const t = await tx.tontine.findUniqueOrThrow({ where: { id: swap.tontineId } });
    const [a, b, ha, hb] = await Promise.all([
      tx.member.findUniqueOrThrow({ where: { id: swap.requesterId }, include: { user: true } }),
      tx.member.findUniqueOrThrow({ where: { id: swap.partnerId }, include: { user: true } }),
      tx.hand.findUniqueOrThrow({ where: { id: swap.requesterHandId } }),
      tx.hand.findUniqueOrThrow({ where: { id: swap.partnerHandId } }),
    ]);

    const reject = async (reason: string) => {
      await tx.turnSwap.update({ where: { id: swapId }, data: { status: "REJECTED", decidedAt: new Date() } });
      await audit({ tontineId: t.id, actorId, action: "SWAP_REJECTED", label: `Échange entre ${a.name} et ${b.name} impossible : ${reason}` }, tx);
      return { error: `Échange impossible : ${reason}` };
    };
    if (t.status !== "ACTIVE") return reject("la tontine n'est plus en cours.");
    if (ha.position !== swap.requesterPosition || hb.position !== swap.partnerPosition) {
      return reject("l'ordre de passage a changé depuis la demande.");
    }
    if (Math.min(ha.position, hb.position) < t.currentRound) return reject("l'un des deux tours a déjà été versé.");

    // Tours déjà ouverts : leur main et leur bénéficiaire changent aussi, à condition que la collecte soit toujours en cours.
    for (const [hand, member, newPosition] of [[ha, a, hb.position], [hb, b, ha.position]] as const) {
      if (newPosition < t.currentRound) continue;
      const round = await tx.round.findUnique({ where: { tontineId_number: { tontineId: t.id, number: newPosition } } });
      if (!round) {
        if (newPosition === t.currentRound) return reject("le tour en cours est en train d'ouvrir, réessayez.");
        continue;
      }
      const { count } = await tx.round.updateMany({
        where: { id: round.id, status: "COLLECTING" },
        data: { handId: hand.id, beneficiaryId: member.id },
      });
      if (count === 0) return reject("la cagnotte du tour en cours est en train d'être versée.");
    }
    // Deux passes, à cause de la contrainte d'unicité sur (tontine, position).
    await tx.hand.update({ where: { id: ha.id }, data: { position: -ha.position } });
    await tx.hand.update({ where: { id: hb.id }, data: { position: ha.position } });
    await tx.hand.update({ where: { id: ha.id }, data: { position: hb.position } });
    await tx.turnSwap.update({ where: { id: swapId }, data: { status: "APPLIED", decidedAt: new Date() } });
    await audit(
      {
        tontineId: t.id,
        actorId,
        action: "SWAP_APPLIED",
        label: `${actorName ? `${actorName} valide l'échange : ` : "Échange validé : "}${a.name} passe du tour ${ha.position} au tour ${hb.position}, ${b.name} du tour ${hb.position} au tour ${ha.position}`,
      },
      tx,
    );
    return { t, moves: [[a, hb.position], [b, ha.position]] as const };
  });

  if ("error" in result) throw new NattError(result.error!);
  const { t, moves } = result;
  for (const [m, round] of moves) {
    await tell(m, "swapApplied", { tontine: t.name, round, date: formatDate(addPeriods(t.startAt, t.frequency, round)) }, `swap-applied:${swapId}:${m.id}`);
  }
}
