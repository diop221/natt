import { describe, expect, it } from "vitest";
import { drawOrder } from "@/lib/chain";
import { db } from "@/lib/db";
import { simulateMockPayment } from "@/lib/payments/mock";
import { reliability } from "@/lib/score";
import {
  NattError,
  coverContribution,
  createSolidarityRequest,
  decideSolidarityRequest,
  placeBid,
  syncTontine,
} from "@/lib/tontine";
import { currentRound, newTontine, pay, people } from "./helpers";

// Tests du moteur sur une vraie base Postgres (natt_test), avec paiements simulés.
// Commission fixée à 1 % (NATT_FEE_BPS=100 dans vitest.config.mts).

describe("tontine rotative", () => {
  it("verse la cagnotte moins la commission puis ouvre le tour suivant", async () => {
    const t = await newTontine();
    const r1 = await currentRound(t.id);
    expect(r1.contributions).toHaveLength(3);
    expect(r1.contributions.every((c) => c.amountXof === 10_000 && c.sats > 0)).toBe(true);
    expect(await db.notification.count({ where: { key: { startsWith: "open:" } } })).toBe(3);

    await pay(t.id, [1, 2]);
    await syncTontine(t.id);
    expect((await currentRound(t.id)).number).toBe(1);

    await pay(t.id);
    await syncTontine(t.id);
    const payout = await db.payout.findFirstOrThrow({ where: { roundId: r1.id }, include: { member: true } });
    expect(payout).toMatchObject({ amountXof: 29_700, feeXof: 300, status: "PAID" });
    expect(payout.member.position).toBe(1);
    expect((await currentRound(t.id)).number).toBe(2);
  });

  it("ne verse qu'une fois même avec des synchronisations simultanées", async () => {
    const t = await newTontine();
    await pay(t.id);
    await Promise.all(Array.from({ length: 10 }, () => syncTontine(t.id).catch(() => {})));
    expect(await db.payout.count()).toBe(1);
    const r2 = await currentRound(t.id);
    expect(r2.number).toBe(2);
    expect(r2.contributions).toHaveLength(3);
  });

  it("termine la tontine après le dernier tour", async () => {
    const t = await newTontine();
    for (let i = 0; i < 3; i++) {
      await pay(t.id);
      await syncTontine(t.id);
    }
    expect((await db.tontine.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("COMPLETED");
    const winners = (await db.payout.findMany({ include: { member: true } })).map((p) => p.member.position).sort();
    expect(winners).toEqual([1, 2, 3]);
  });

  it("réémet une facture expirée", async () => {
    const t = await newTontine();
    const before = (await currentRound(t.id)).contributions[0];
    await db.mockInvoice.update({ where: { id: before.invoiceId! }, data: { status: "expired" } });
    await syncTontine(t.id);
    const after = await db.contribution.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.invoiceId).not.toBe(before.invoiceId);
    expect(after.status).toBe("pending");
  });
});

describe("échéances, rappels et pénalités", () => {
  it("rappelle la veille, puis applique une seule pénalité par retard", async () => {
    const t = await newTontine({ latePenaltyXof: 500 });
    await pay(t.id, [1]);
    const { dueAt } = await currentRound(t.id);

    await syncTontine(t.id, new Date(dueAt.getTime() - 12 * 3600 * 1000));
    expect(await db.notification.count({ where: { key: { startsWith: "due:" } } })).toBe(2);

    const late = new Date(dueAt.getTime() + 3600 * 1000);
    await syncTontine(t.id, late);
    await syncTontine(t.id, late);
    expect(await db.notification.count({ where: { key: { startsWith: "late:" } } })).toBe(2);
    const penalties = await db.charge.findMany({ where: { kind: "PENALTY" } });
    expect(penalties).toHaveLength(2);
    expect(penalties.every((p) => p.amountXof === 500)).toBe(true);

    // Une pénalité payée alimente le fonds.
    await simulateMockPayment(penalties[0].invoiceId);
    await syncTontine(t.id, late);
    expect((await db.tontine.findUniqueOrThrow({ where: { id: t.id } })).fundXof).toBe(500);
  });
});

describe("fonds de garantie", () => {
  it("avance la cotisation d'un retardataire, qui la rembourse ensuite", async () => {
    const t = await newTontine({ amountXof: 1_000, guaranteeBps: 5_000 });
    expect((await currentRound(t.id)).contributions[0].sats).toBeGreaterThan(0);
    await pay(t.id);
    await syncTontine(t.id);
    expect((await db.tontine.findUniqueOrThrow({ where: { id: t.id } })).fundXof).toBe(1_500);

    await pay(t.id, [1, 2]);
    await syncTontine(t.id);
    const r2 = await currentRound(t.id);
    const lateOne = r2.contributions.find((c) => c.member.position === 3)!;
    await expect(coverContribution(lateOne.id)).rejects.toThrow(NattError); // pas encore échue

    await coverContribution(lateOne.id, new Date(r2.dueAt.getTime() + 1000));
    expect(await db.payout.count({ where: { roundId: r2.id, status: "PAID" } })).toBe(1);
    const repayment = await db.charge.findFirstOrThrow({ where: { kind: "REPAYMENT" } });
    expect(repayment.amountXof).toBe(1_500);
    expect((await db.tontine.findUniqueOrThrow({ where: { id: t.id } })).fundXof).toBe(1_500 + 1_000 - 1_000);

    await simulateMockPayment(repayment.invoiceId);
    await syncTontine(t.id);
    expect((await db.tontine.findUniqueOrThrow({ where: { id: t.id } })).fundXof).toBe(3_000);
  });

  it("refuse d'avancer si le fonds est insuffisant", async () => {
    const t = await newTontine({ amountXof: 10_000, guaranteeBps: 100 });
    const r1 = await currentRound(t.id);
    await expect(coverContribution(r1.contributions[0].id, new Date(r1.dueAt.getTime() + 1000))).rejects.toThrow(
      "pas suffisant",
    );
    expect((await db.contribution.findUniqueOrThrow({ where: { id: r1.contributions[0].id } })).status).toBe("pending");
  });
});

describe("tirage au sort vérifiable", () => {
  it("fixe l'ordre de passage à partir du hash du bloc", async () => {
    const t = await newTontine({ orderMode: "DRAW", members: people(5) });
    // Ce sont les mains (tours) qui sont tirées au sort.
    const tontine = await db.tontine.findUniqueOrThrow({ where: { id: t.id }, include: { hands: { include: { holders: true } } } });
    expect(tontine.status).toBe("ACTIVE");
    expect(tontine.drawBlockHash).toMatch(/^[0-9a-f]{64}$/);
    const expected = drawOrder(tontine.drawBlockHash!, tontine.hands);
    const actual = [...tontine.hands].sort((a, b) => a.position - b.position).map((h) => h.id);
    expect(actual).toEqual(expected.map((h) => h.id));
    expect((await currentRound(t.id)).beneficiaryId).toBe(expected[0].holders[0].memberId);
  });
});

describe("tontine à enchères", () => {
  it("donne le tour au plus offrant et partage la remise en crédit", async () => {
    const t = await newTontine({ type: "AUCTION" });
    const r1 = await currentRound(t.id);
    const byPos = (p: number) => r1.contributions.find((c) => c.member.position === p)!.memberId;
    await placeBid(r1.id, byPos(2), 3_000);
    await placeBid(r1.id, byPos(3), 2_000);
    await expect(placeBid(r1.id, byPos(1), 20_000)).rejects.toThrow("comprise entre");

    await pay(t.id);
    await syncTontine(t.id);
    const won = await db.round.findUniqueOrThrow({ where: { id: r1.id }, include: { payouts: true } });
    expect(won.beneficiaryId).toBe(byPos(2));
    expect(won.payouts[0]).toMatchObject({ amountXof: 27_000 - 270, feeXof: 270 });

    const r2 = await currentRound(t.id);
    const payable = (p: number) => {
      const c = r2.contributions.find((c) => c.member.position === p)!;
      return c.amountXof - c.creditUsedXof;
    };
    expect([payable(1), payable(2), payable(3)]).toEqual([8_500, 10_000, 8_500]);
    await expect(placeBid(r2.id, byPos(2), 1_000)).rejects.toThrow("déjà reçu");

    await pay(t.id);
    await syncTontine(t.id); // sans enchère : premier dans l'ordre parmi ceux qui restent
    expect((await db.round.findUniqueOrThrow({ where: { id: r2.id } })).beneficiaryId).toBe(byPos(1));
    await pay(t.id);
    await syncTontine(t.id);
    expect((await db.tontine.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("COMPLETED");
  });
});

describe("épargne cumulative", () => {
  it("rend à chacun ses cotisations à la fin", async () => {
    const t = await newTontine({ type: "SAVINGS", amountXof: 5_000, totalRounds: 3, members: people(2), goalLabel: "Tabaski" });
    for (let i = 0; i < 3; i++) {
      expect(await db.payout.count()).toBe(0);
      await pay(t.id);
      await syncTontine(t.id);
    }
    const payouts = await db.payout.findMany();
    expect(payouts).toHaveLength(2);
    expect(payouts.every((p) => p.amountXof === 14_850 && p.feeXof === 150 && p.status === "PAID")).toBe(true);
    expect((await db.tontine.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("COMPLETED");
  });
});

describe("caisse de solidarité", () => {
  it("alimente la caisse et verse les demandes acceptées", async () => {
    const t = await newTontine({ type: "SOLIDARITY", amountXof: 2_000, totalRounds: 2 });
    await pay(t.id);
    await syncTontine(t.id);
    expect((await db.tontine.findUniqueOrThrow({ where: { id: t.id } })).fundXof).toBe(6_000);
    expect(await db.payout.count()).toBe(0);

    const member = await db.member.findFirstOrThrow({ where: { tontineId: t.id, position: 2 } });
    const req = await createSolidarityRequest(member.id, { reason: "DEATH", description: "Décès", amountXof: 4_000 });
    await decideSolidarityRequest(req.id, true);
    expect(await db.solidarityRequest.findUniqueOrThrow({ where: { id: req.id } })).toMatchObject({ status: "PAID" });
    expect((await db.tontine.findUniqueOrThrow({ where: { id: t.id } })).fundXof).toBe(2_000);

    const big = await createSolidarityRequest(member.id, { reason: "HEALTH", description: "Hôpital", amountXof: 5_000 });
    await expect(decideSolidarityRequest(big.id, true)).rejects.toThrow("pas assez");
    expect((await db.solidarityRequest.findUniqueOrThrow({ where: { id: big.id } })).status).toBe("PENDING");
  });
});

describe("score de fiabilité", () => {
  it("compte les paiements à temps, en retard et manqués", async () => {
    const u = await db.user.create({ data: { name: "M1", phone: "+221780000001", passwordHash: "x" } });
    const t = await newTontine({ members: people(3) });
    await db.member.updateMany({ where: { phone: u.phone }, data: { userId: u.id } });
    for (let i = 0; i < 3; i++) {
      await pay(t.id);
      await syncTontine(t.id);
    }
    // Les 3 cotisations ont été payées avant l'échéance.
    expect(await reliability(u.id)).toMatchObject({ total: 3, onTime: 3, score: 100 });
  });
});
