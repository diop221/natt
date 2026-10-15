import { describe, expect, it } from "vitest";
import {
  canonical,
  checkCertificate,
  findByNumber,
  publicKey,
  requestCertificate,
  revokeCertificate,
  syncCertificate,
  verifySignature,
  type CertificatePayload,
} from "@/lib/certificates";
import { db } from "@/lib/db";
import { confirmReceived, createMerchant, createOffer, markDelivered, verifyMerchant } from "@/lib/merchants";
import { simulateMockPayment } from "@/lib/payments/mock";
import { NattError, syncTontine } from "@/lib/tontine";
import { currentRound, newTontine, pay, people } from "./helpers";

// Lot 3 : Natt Marchands et attestation vérifiable. Commission Natt à 1 % (vitest.config.mts).

async function sheepOffer(verified = true) {
  const merchant = await createMerchant({
    name: "Bergerie de Thiès",
    category: "TABASKI",
    description: "Moutons ladoum et touabir",
    city: "Thiès",
    phone: "+221779990001",
    network: "wave",
    commissionBps: 400,
  });
  if (verified) await verifyMerchant(merchant.id);
  return createOffer({ merchantId: merchant.id, title: "Mouton touabir", description: "40 kg environ", priceXof: 160_000, nattPriceXof: 150_000, delivery: "Livraison à Dakar la veille de la Tabaski" });
}

async function runAll(tontineId: string) {
  for (let i = 0; i < 20 && (await db.tontine.findUniqueOrThrow({ where: { id: tontineId } })).status === "ACTIVE"; i++) {
    await pay(tontineId);
    await syncTontine(tontineId);
  }
}

describe("Natt Marchands", () => {
  it("paie le marchand au prix Natt moins sa commission, et verse le reste au membre sans frais sur l'achat", async () => {
    const offer = await sheepOffer();
    const t = await newTontine({ type: "SAVINGS", amountXof: 20_000, totalRounds: 8, members: people(2), offerId: offer.id });
    await runAll(t.id);

    const payouts = await db.payout.findMany({ orderBy: { key: "asc" } });
    // 160 000 épargnés chacun : 150 000 pour le mouton (dont 6 000 de commission), 10 000 en espèces moins 1 %.
    expect(payouts.map((p) => [p.key.startsWith("order:") ? "marchand" : "membre", p.amountXof, p.feeXof, p.status])).toEqual([
      ["membre", 9_900, 100, "PAID"],
      ["membre", 9_900, 100, "PAID"],
      ["marchand", 144_000, 6_000, "PAID"],
      ["marchand", 144_000, 6_000, "PAID"],
    ]);
    const orders = await db.order.findMany({ include: { member: true } });
    expect(orders.map((o) => o.status)).toEqual(["PAID", "PAID"]);
    expect(await db.notification.count({ where: { phone: "+221779990001", body: { contains: "Mouton touabir" } } })).toBe(2);

    await markDelivered(orders[0].token);
    await confirmReceived(orders[0].id, "x");
    expect((await db.order.findUniqueOrThrow({ where: { id: orders[0].id } })).status).toBe("RECEIVED");
    await expect(confirmReceived(orders[0].id, "x")).rejects.toThrow("déjà");
  });

  it("dans une tontine classique, chaque tour achète l'article de son bénéficiaire", async () => {
    const offer = await sheepOffer();
    const t = await newTontine({ amountXof: 60_000, members: people(3), offerId: offer.id });
    await pay(t.id);
    await syncTontine(t.id);
    const r1 = await db.round.findFirstOrThrow({ where: { tontineId: t.id, number: 1 }, include: { payouts: true } });
    // Cagnotte 180 000 : 150 000 au marchand, 30 000 − 1 % au bénéficiaire.
    expect(r1.payouts.map((p) => [p.merchantId ? "marchand" : "membre", p.amountXof, p.feeXof]).sort()).toEqual([
      ["marchand", 144_000, 6_000],
      ["membre", 29_700, 300],
    ]);
    expect(r1.status).toBe("DONE");
  });

  it("attend la vérification du numéro du marchand avant de le payer", async () => {
    const offer = await sheepOffer(false);
    const t = await newTontine({ amountXof: 60_000, members: people(3), offerId: offer.id });
    await pay(t.id);
    await syncTontine(t.id);
    const blocked = await db.payout.findFirstOrThrow({ where: { merchantId: { not: null } } });
    expect(blocked).toMatchObject({ status: "FAILED", error: expect.stringContaining("vérifié par Natt") });
    expect((await currentRound(t.id)).number).toBe(1);

    await verifyMerchant(offer.merchantId);
    expect(await db.payout.findUniqueOrThrow({ where: { id: blocked.id } })).toMatchObject({ status: "PAID" });
    expect((await currentRound(t.id)).number).toBe(2);
  });

  it("refuse une tontine dont la cagnotte ne couvre pas l'achat, ou avec des demi-mains", async () => {
    const offer = await sheepOffer();
    await expect(newTontine({ amountXof: 10_000, members: people(3), offerId: offer.id })).rejects.toThrow("ne couvre pas");
    await db.user.deleteMany();
    await expect(
      newTontine({ amountXof: 100_000, offerId: offer.id, members: people(3).map((m, i) => ({ ...m, halves: [1, 1, 2][i] })) }),
    ).rejects.toThrow(NattError);
  });
});

describe("attestation de régularité", () => {
  async function history() {
    const t = await newTontine({ latePenaltyXof: 500 });
    const u = await db.user.create({ data: { name: "Moussa Diop", phone: "+221780000002", passwordHash: "x" } });
    await db.member.updateMany({ where: { phone: u.phone }, data: { userId: u.id } });
    // Tour 1 à temps ; tour 2 en retard (pénalité impayée).
    await pay(t.id);
    await syncTontine(t.id);
    await pay(t.id, [1, 3]);
    const r2 = await currentRound(t.id);
    await syncTontine(t.id, new Date(r2.dueAt.getTime() + 1000));
    await pay(t.id);
    await syncTontine(t.id);
    // L'heure de paiement est l'heure réelle : on place celle de Moussa après l'échéance du tour 2.
    await db.contribution.updateMany({ where: { roundId: r2.id, member: { userId: u.id } }, data: { paidAt: new Date(r2.dueAt.getTime() + 3600 * 1000) } });
    return { t, u };
  }

  it("émet après paiement un document signé qui distingue enregistré, payé, reçu et dû", async () => {
    const { u } = await history();
    const cert = await requestCertificate(u.id);
    expect(cert.priceXof).toBe(2_500);
    await expect(requestCertificate(u.id)).rejects.toThrow("attend déjà");
    expect((await checkCertificate(cert.id)).state).toBe("UNKNOWN"); // pas encore payée

    await simulateMockPayment(cert.invoiceId!);
    await syncCertificate(cert.id);
    const check = await checkCertificate(cert.id);
    expect(check.state).toBe("VALID");
    const p = check.payload as CertificatePayload;
    expect(p.holder).toEqual({ name: "Moussa Diop", phone: "+22178•••••02", identity: "DECLARED" });
    expect(p.totals).toMatchObject({ recordedCount: 2, recordedXof: 20_000, paidXof: 20_000, onTime: 1, late: 1, missed: 0, potsReceivedXof: 29_700, outstandingXof: 500 });

    // Une seule modification du contenu suffit à invalider la signature.
    expect(verifySignature(p, check.cert!.signature!, publicKey().base64)).toBe(true);
    expect(verifySignature({ ...p, totals: { ...p.totals, paidXof: 99_999 } }, check.cert!.signature!, publicKey().base64)).toBe(false);
    expect(canonical({ b: 1, a: [2, { d: 1, c: 0 }] })).toBe('{"a":[2,{"c":0,"d":1}],"b":1}');

    expect(await findByNumber(p.number.toLowerCase(), "moussa diop")).toBe(cert.id);
    expect(await findByNumber(p.number, "Quelqu'un d'autre")).toBeNull();

    await revokeCertificate(cert.id, u.id);
    expect((await checkCertificate(cert.id)).state).toBe("REVOKED");
    expect((await checkCertificate(cert.id, new Date(Date.now() + 100 * 24 * 3600 * 1000))).state).toBe("REVOKED");
  });

  it("signale une attestation expirée et refuse un compte sans tontine", async () => {
    const { u } = await history();
    process.env.ATTESTATION_PRICE_XOF = "0";
    try {
      const cert = await requestCertificate(u.id);
      expect((await checkCertificate(cert.id)).state).toBe("VALID");
      expect((await checkCertificate(cert.id, new Date(Date.now() + 91 * 24 * 3600 * 1000))).state).toBe("EXPIRED");
      const lonely = await db.user.create({ data: { name: "Sans tontine", phone: "+221700000000", passwordHash: "x" } });
      await expect(requestCertificate(lonely.id)).rejects.toThrow("Aucune tontine");
    } finally {
      delete process.env.ATTESTATION_PRICE_XOF;
    }
  });
});
