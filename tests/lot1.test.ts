import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { answerSwap, cancelSwap, decideSwap, requestSwap } from "@/lib/swaps";
import { NattError, syncTontine } from "@/lib/tontine";
import { checkVerificationCode, confirmByOrganizer, inviteAll, sendVerificationCode, updatePaymentDetails } from "@/lib/verification";
import { currentRound, newTontine, owner, pay, people } from "./helpers";

// Lot 1 : vérification des numéros de versement et échange sécurisé des tours.

// Dernier code envoyé sur un numéro (mode simulé : les messages sont en base).
async function lastCode(phone: string) {
  const n = await db.notification.findFirstOrThrow({ where: { phone, body: { contains: "code de vérification" } }, orderBy: { createdAt: "desc" } });
  return n.body.match(/(\d{6})/)![1];
}

const member = (tontineId: string, position: number) => db.member.findFirstOrThrow({ where: { tontineId, position } });

// Échange de tours : on propose sa main (son tour) contre celle d'un autre membre.
const handOf = async (memberId: string) => (await db.handHolder.findFirstOrThrow({ where: { memberId } })).handId;
const ask = async (from: { id: string }, to: { id: string }, actorId: string) =>
  requestSwap(await handOf(from.id), await handOf(to.id), from.id, actorId);
const holderAt = async (tontineId: string, position: number) =>
  (await db.hand.findFirstOrThrow({ where: { tontineId, position }, include: { holders: true } })).holders[0].memberId;

describe("vérification des numéros", () => {
  it("bloque le versement vers un numéro non vérifié, puis le libère après le code", async () => {
    const t = await newTontine({ verifyPayouts: true });
    await inviteAll(t.id);
    expect(await db.notification.count({ where: { key: { startsWith: "verify-invite:" } } })).toBe(3);

    await pay(t.id);
    await syncTontine(t.id);
    const r1 = await db.round.findFirstOrThrow({ where: { tontineId: t.id, number: 1 }, include: { payouts: true } });
    expect(r1.status).toBe("PAYOUT_FAILED");
    expect(r1.payouts[0]).toMatchObject({ status: "FAILED", error: expect.stringContaining("non vérifié") });
    // L'organisateur est prévenu une seule fois, même si la synchronisation repasse.
    await syncTontine(t.id);
    expect(await db.notification.count({ where: { key: { startsWith: "blocked:" } } })).toBe(1);
    expect(await db.auditEntry.count({ where: { action: "PAYOUT_BLOCKED" } })).toBe(1);

    const m1 = await member(t.id, 1);
    await sendVerificationCode(m1.id);
    await expect(sendVerificationCode(m1.id)).rejects.toThrow("Patientez"); // anti-spam
    await expect(checkVerificationCode(m1.id, "000000" === (await lastCode(m1.phone)) ? "111111" : "000000")).rejects.toThrow("incorrect");
    await checkVerificationCode(m1.id, await lastCode(m1.phone));

    expect(await db.member.findUniqueOrThrow({ where: { id: m1.id } })).toMatchObject({ verifiedVia: "OTP" });
    expect(await db.payout.findFirstOrThrow({ where: { roundId: r1.id } })).toMatchObject({ status: "PAID" });
    expect((await currentRound(t.id)).number).toBe(2);
  });

  it("limite les essais et refuse un code expiré", async () => {
    const t = await newTontine({ verifyPayouts: true });
    const m1 = await member(t.id, 1);
    const now = new Date();
    await sendVerificationCode(m1.id, now);
    const good = await lastCode(m1.phone);
    const bad = good === "123456" ? "654321" : "123456";
    for (let i = 0; i < 5; i++) await expect(checkVerificationCode(m1.id, bad, now)).rejects.toThrow(NattError);
    await expect(checkVerificationCode(m1.id, good, now)).rejects.toThrow("Trop d'essais");

    const later = new Date(now.getTime() + 2 * 60 * 1000);
    await sendVerificationCode(m1.id, later);
    await expect(checkVerificationCode(m1.id, await lastCode(m1.phone), new Date(later.getTime() + 16 * 60 * 1000))).rejects.toThrow("expiré");
    expect((await db.member.findUniqueOrThrow({ where: { id: m1.id } })).verifiedAt).toBeNull();
  });

  it("vérifie d'un coup toutes les places du même numéro", async () => {
    const t1 = await newTontine();
    const u = await db.user.findFirstOrThrow();
    const { createTontine } = await import("@/lib/tontine");
    const t2 = await createTontine(u.id, {
      name: "Autre", type: "ROTATING", amountXof: 1_000, frequency: "weekly", members: people(2), orderMode: "MANUAL", latePenaltyXof: 0, guaranteeBps: 0,
    });
    const m = await member(t1.id, 1);
    await sendVerificationCode(m.id);
    await checkVerificationCode(m.id, await lastCode(m.phone));
    expect((await member(t2.id, 1)).verifiedVia).toBe("OTP");
    expect((await member(t2.id, 2)).verifiedAt).toBeNull();
  });

  it("l'organisateur peut confirmer un numéro, sauf le sien, et un changement de numéro remet à zéro", async () => {
    const u = await owner();
    const { createTontine } = await import("@/lib/tontine");
    const t = await createTontine(u.id, {
      name: "T", type: "ROTATING", amountXof: 1_000, frequency: "weekly", orderMode: "MANUAL", latePenaltyXof: 0, guaranteeBps: 0, verifyPayouts: true,
      members: [{ name: "Awa", phone: u.phone, network: "wave" }, ...people(2)],
    });
    await db.member.updateMany({ where: { phone: u.phone }, data: { userId: u.id } });
    await expect(confirmByOrganizer((await member(t.id, 1)).id, u.id, u.name)).rejects.toThrow("propre numéro");

    const m2 = await member(t.id, 2);
    await confirmByOrganizer(m2.id, u.id, u.name);
    expect(await member(t.id, 2)).toMatchObject({ verifiedVia: "ORGANIZER" });

    await updatePaymentDetails(m2.id, { phone: "+221789999999", network: "orange_money" }, u.id);
    expect(await member(t.id, 2)).toMatchObject({ phone: "+221789999999", network: "orange_money", verifiedAt: null, verifiedVia: null });
    await expect(updatePaymentDetails(m2.id, { phone: (await member(t.id, 3)).phone, network: "wave" }, u.id)).rejects.toThrow("déjà ce numéro");
    expect(await db.auditEntry.findMany({ where: { tontineId: t.id }, select: { action: true }, orderBy: { createdAt: "asc" } })).toEqual(
      expect.arrayContaining([{ action: "CONFIRMED" }, { action: "PHONE_CHANGED" }, { action: "VERIFY_INVITE" }]),
    );
  });
});

describe("échange de tours", () => {
  async function setup() {
    const t = await newTontine({ members: people(4) });
    const users = await Promise.all(
      [2, 3, 4].map((i) => db.user.create({ data: { name: `M${i}`, phone: `+22178000000${i}`, passwordHash: "x" } })),
    );
    for (const u of users) await db.member.updateMany({ where: { phone: u.phone }, data: { userId: u.id } });
    const organizer = await db.user.findFirstOrThrow({ where: { phone: "+221770000001" } });
    return { t, organizer, users };
  }

  it("demande, accord du partenaire, validation de l'organisateur, calendrier mis à jour", async () => {
    const { t, organizer, users } = await setup();
    const [m2, m4] = [await member(t.id, 2), await member(t.id, 4)];
    const swap = await ask(m4, m2, users[2].id);
    await expect(ask(await member(t.id, 3), m2, users[1].id)).rejects.toThrow("déjà en cours");
    await expect(decideSwap(swap.id, true, organizer.id, organizer.name)).rejects.toThrow("pas encore répondu");

    await answerSwap(swap.id, m2.id, true, users[0].id);
    expect((await db.turnSwap.findUniqueOrThrow({ where: { id: swap.id } })).status).toBe("PENDING_ORGANIZER");
    expect(await db.notification.count({ where: { key: `swap-organizer:${swap.id}` } })).toBe(1);

    await decideSwap(swap.id, true, organizer.id, organizer.name);
    expect(await holderAt(t.id, 2)).toBe(m4.id);
    expect(await holderAt(t.id, 4)).toBe(m2.id);
    expect(await db.auditEntry.count({ where: { tontineId: t.id, action: { startsWith: "SWAP_" } } })).toBe(3);

    // Le tour 2 va bien à celui qui a demandé l'échange.
    await pay(t.id);
    await syncTontine(t.id);
    await pay(t.id);
    await syncTontine(t.id);
    expect((await db.round.findFirstOrThrow({ where: { tontineId: t.id, number: 2 } })).beneficiaryId).toBe(m4.id);
  });

  it("change aussi le bénéficiaire du tour en cours tant que la collecte n'est pas close", async () => {
    const { t, organizer, users } = await setup();
    const [m1, m3] = [await member(t.id, 1), await member(t.id, 3)];
    const swap = await ask(m3, m1, users[1].id);
    // Le partenaire est l'organisateur : son accord vaut validation.
    await db.member.update({ where: { id: m1.id }, data: { userId: organizer.id } });
    await answerSwap(swap.id, m1.id, true, organizer.id);
    expect((await db.turnSwap.findUniqueOrThrow({ where: { id: swap.id } })).status).toBe("APPLIED");
    expect((await currentRound(t.id)).beneficiaryId).toBe(m3.id);

    await pay(t.id);
    await syncTontine(t.id);
    expect((await db.payout.findFirstOrThrow()).memberId).toBe(m3.id);
    // Tour 1 versé : m3 ne peut plus échanger.
    await expect(ask(m3, await member(t.id, 4), users[1].id)).rejects.toThrow("déjà été versé");
  });

  it("refuse l'échange devenu impossible et garde la trace des refus et annulations", async () => {
    const { t, organizer, users } = await setup();
    const [m1, m2, m3, m4] = await Promise.all([1, 2, 3, 4].map((p) => member(t.id, p)));
    const swap = await ask(m2, m3, users[0].id);
    await answerSwap(swap.id, m3.id, true, users[1].id);
    // Entre-temps, le tour 2 est versé.
    await pay(t.id);
    await syncTontine(t.id);
    await pay(t.id);
    await syncTontine(t.id);
    await expect(decideSwap(swap.id, true, organizer.id, organizer.name)).rejects.toThrow("déjà été versé");
    expect((await db.turnSwap.findUniqueOrThrow({ where: { id: swap.id } })).status).toBe("REJECTED");

    const refused = await ask(m4, m3, users[2].id);
    await expect(answerSwap(refused.id, m4.id, true, users[2].id)).rejects.toThrow("pas adressée");
    await answerSwap(refused.id, m3.id, false, users[1].id);
    expect(await db.notification.count({ where: { key: `swap-declined:${refused.id}` } })).toBe(1);

    const cancelled = await ask(m4, m3, users[2].id);
    await expect(cancelSwap(cancelled.id, m3.id, users[1].id)).rejects.toThrow("auteur");
    await cancelSwap(cancelled.id, m4.id, users[2].id);
    expect((await db.turnSwap.findUniqueOrThrow({ where: { id: cancelled.id } })).status).toBe("CANCELLED");
    expect(await holderAt(t.id, 1)).toBe(m1.id);
  });

  it("n'existe pas pour les tontines à enchères (pas de mains)", async () => {
    const t = await newTontine({ type: "AUCTION" });
    expect(await db.hand.count({ where: { tontineId: t.id } })).toBe(0);
  });
});
