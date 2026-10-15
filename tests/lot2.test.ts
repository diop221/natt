import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { checkHands, defaultHands } from "@/lib/hands";
import { decideIncident, recordEvidence, reportIncident, setContacts, suspendMember } from "@/lib/incidents";
import { simulateMockPayment } from "@/lib/payments/mock";
import { answerSwap, requestSwap } from "@/lib/swaps";
import { NattError, sendAnnouncement, setVoiceNotes, syncTontine } from "@/lib/tontine";
import { checkVerificationCode, sendVerificationCode } from "@/lib/verification";
import { currentRound, newTontine, owner, pay, people } from "./helpers";

// Lot 2 : demi-mains et doubles mains, réserve de fin de cycle, situations exceptionnelles,
// messages vocaux en wolof. Commission à 1 % (vitest.config.mts).

const member = (tontineId: string, position: number) => db.member.findFirstOrThrow({ where: { tontineId, position } });
const tontineRow = (id: string) => db.tontine.findUniqueOrThrow({ where: { id } });

async function runAll(tontineId: string) {
  for (let i = 0; i < 20 && (await tontineRow(tontineId)).status === "ACTIVE"; i++) {
    await pay(tontineId);
    await syncTontine(tontineId);
  }
}

describe("demi-mains et doubles mains", () => {
  it("planifie et contrôle les mains", () => {
    expect(defaultHands([4, 1, 1, 2])).toEqual([[0], [0], [1, 2], [3]]);
    expect(checkHands([4, 1, 1, 2], [[1, 2], [0], [3], [0]])).toBeNull();
    expect(checkHands([2, 1], [[0], [1]])).toMatch("partagée");
    expect(checkHands([4, 2], [[0], [1]])).toMatch("exactement sa part");
    expect(checkHands([1, 1], [[0, 0], [1, 1]])).toMatch("deux membres différents");
  });

  it("ajuste les cotisations, partage la demi-main entre ses deux titulaires", async () => {
    const members = people(4).map((m, i) => ({ ...m, halves: [4, 1, 1, 2][i] }));
    const t = await newTontine({ members });
    expect((await tontineRow(t.id)).totalRounds).toBe(4);

    const r1 = await currentRound(t.id);
    const due = Object.fromEntries(r1.contributions.map((c) => [c.member.name, c.amountXof]));
    expect(due).toEqual({ M1: 20_000, M2: 5_000, M3: 5_000, M4: 10_000 });
    expect(r1.beneficiaryId).toBe((await member(t.id, 1)).id);

    await runAll(t.id);
    expect((await tontineRow(t.id)).status).toBe("COMPLETED");
    const payouts = await db.payout.findMany({ include: { member: true, round: true }, orderBy: { createdAt: "asc" } });
    // Cagnotte de 40 000 : deux tours pour M1, un tour partagé entre M2 et M3, un tour pour M4.
    expect(payouts.map((p) => [p.round!.number, p.member.name, p.amountXof, p.feeXof])).toEqual([
      [1, "M1", 39_600, 400],
      [2, "M1", 39_600, 400],
      [3, "M2", 19_800, 200],
      [3, "M3", 19_800, 200],
      [4, "M4", 39_600, 400],
    ]);
    expect((await db.round.findFirstOrThrow({ where: { tontineId: t.id, number: 3 } })).beneficiaryId).toBeNull();
  });

  it("refuse une répartition incohérente ou une cotisation impaire avec des demi-mains", async () => {
    await expect(newTontine({ members: people(3).map((m, i) => ({ ...m, halves: [1, 2, 2][i] })) })).rejects.toThrow(NattError);
    await db.user.deleteMany();
    await expect(newTontine({ amountXof: 10_001, members: people(3).map((m, i) => ({ ...m, halves: [1, 1, 2][i] })) })).rejects.toThrow("pair");
  });

  it("tire au sort les mains, et une double main peut échanger l'un de ses tours mais pas une demi-main partagée", async () => {
    const members = people(4).map((m, i) => ({ ...m, halves: [4, 1, 1, 2][i] }));
    const t = await newTontine({ members, orderMode: "DRAW" });
    const hands = await db.hand.findMany({ where: { tontineId: t.id }, include: { holders: true }, orderBy: { position: "asc" } });
    expect(hands.map((h) => h.position)).toEqual([1, 2, 3, 4]);

    const [m1, m2, , m4] = await Promise.all([1, 2, 3, 4].map((p) => member(t.id, p)));
    const m1Hands = hands.filter((h) => h.holders.some((x) => x.memberId === m1.id));
    const shared = hands.find((h) => h.holders.length === 2)!;
    const m4Hand = hands.find((h) => h.holders[0].memberId === m4.id)!;
    const u = await db.user.findFirstOrThrow();
    await expect(requestSwap(shared.id, m4Hand.id, m2.id, u.id)).rejects.toThrow("demi-main partagée");
    await expect(requestSwap(m1Hands[0].id, m1Hands[1].id, m1.id, u.id)).rejects.toThrow("autre membre");

    // M1 propose sa deuxième main à M4 ; M1 gère la tontine, donc l'accord de M4 suffit.
    await db.member.update({ where: { id: m1.id }, data: { userId: u.id } });
    const swap = await requestSwap(m1Hands[1].id, m4Hand.id, m1.id, u.id);
    await answerSwap(swap.id, m4.id, true, u.id);
    expect((await db.hand.findUniqueOrThrow({ where: { id: m1Hands[1].id } })).position).toBe(m4Hand.position);
    expect((await db.hand.findUniqueOrThrow({ where: { id: m4Hand.id } })).position).toBe(m1Hands[1].position);
  });
});

describe("réserve de fin de cycle", () => {
  it("retient 5 % de chaque cagnotte, règle les dettes du membre et rend le reste à la fin", async () => {
    const t = await newTontine({ reserveBps: 500, latePenaltyXof: 500 });
    // Tour 1 : M3 paie en retard et ne règle jamais sa pénalité.
    await pay(t.id, [1, 2]);
    const r1 = await currentRound(t.id);
    await syncTontine(t.id, new Date(r1.dueAt.getTime() + 1000));
    expect(await db.charge.count({ where: { kind: "PENALTY", status: "pending" } })).toBe(1);
    await runAll(t.id);

    const roundPayouts = await db.payout.findMany({ where: { key: { startsWith: "round:" } } });
    // 30 000 − 300 de commission − 1 500 de réserve
    expect(roundPayouts.every((p) => p.amountXof === 28_200 && p.feeXof === 300)).toBe(true);

    const reserves = await db.payout.findMany({ where: { key: { startsWith: "reserve:" } }, include: { member: true } });
    expect(Object.fromEntries(reserves.map((p) => [p.member.name, p.amountXof]))).toEqual({ M1: 1_500, M2: 1_500, M3: 1_000 });
    expect(reserves.every((p) => p.status === "PAID" && p.feeXof === 0)).toBe(true);
    expect(await db.charge.count({ where: { kind: "PENALTY", status: "paid" } })).toBe(1);
    expect(await db.member.count({ where: { tontineId: t.id, reserveXof: { not: 0 } } })).toBe(0);
    expect(await db.reserveEntry.groupBy({ by: ["reason"], _sum: { amountXof: true }, orderBy: { reason: "asc" } })).toEqual([
      { reason: "HOLD", _sum: { amountXof: 4_500 } },
      { reason: "RELEASE", _sum: { amountXof: -4_000 } },
      { reason: "SETTLE", _sum: { amountXof: -500 } },
    ]);
    expect(await db.notification.count({ where: { body: { contains: "réserve" } } })).toBe(3);
  });
});

describe("situations exceptionnelles et ayants droit", () => {
  async function setup() {
    const t = await newTontine();
    const organizer = await db.user.findFirstOrThrow();
    return { t, organizer, actor: { id: organizer.id, name: organizer.name } };
  }

  it("suspend rappels, pénalités et versement, puis reprend", async () => {
    const { t, actor } = await setup();
    const m1 = await member(t.id, 1);
    await setContacts(m1.id, { emergencyName: "Aïssatou", emergencyPhone: "+221770000099", heirName: "Ousmane", heirPhone: "+221770000098", heirRelation: "fils" }, actor.id);
    const incident = await reportIncident(m1.id, { kind: "HOSPITAL", description: "Hospitalisé à Fann" }, actor);
    await expect(reportIncident(m1.id, { kind: "HOSPITAL", description: "x" }, actor)).rejects.toThrow("déjà en cours");
    expect(await db.notification.count({ where: { key: `incident:${incident.id}` } })).toBe(1);
    await suspendMember(incident.id, actor);

    const r1 = await currentRound(t.id);
    await pay(t.id, [2, 3]);
    await syncTontine(t.id, new Date(r1.dueAt.getTime() + 1000));
    expect(await db.notification.count({ where: { key: { startsWith: `late:${r1.id}:${m1.id}` } } })).toBe(0);

    // Le tour 1 revient à M1 : son versement attend la fin de la situation.
    await pay(t.id);
    await syncTontine(t.id);
    const held = await db.payout.findFirstOrThrow({ where: { roundId: r1.id } });
    expect(held).toMatchObject({ status: "FAILED", error: expect.stringContaining("situation exceptionnelle") });

    await decideIncident(incident.id, { decision: "RESUME" }, actor);
    expect(await db.payout.findFirstOrThrow({ where: { roundId: r1.id } })).toMatchObject({ status: "PAID" });
    expect((await currentRound(t.id)).number).toBe(2);
  });

  it("ne transfère la place à un ayant droit qu'avec un justificatif, et ne lui verse qu'après vérification", async () => {
    const { t, actor } = await setup();
    const m1 = await member(t.id, 1);
    const incident = await reportIncident(m1.id, { kind: "DEATH", description: "Décès" }, actor);
    const heir = { name: "Ousmane", phone: "+221770000098", network: "orange_money" };
    await expect(decideIncident(incident.id, { decision: "TRANSFER", heir }, actor)).rejects.toThrow("justificatif");
    await recordEvidence(incident.id, "Certificat de décès vu le 15/10, mairie de Dakar-Plateau", actor);
    await decideIncident(incident.id, { decision: "TRANSFER", heir }, actor);

    const place = await db.member.findUniqueOrThrow({ where: { id: m1.id } });
    expect(place).toMatchObject({ name: "Ousmane", phone: heir.phone, network: "orange_money", verifiedAt: null });
    expect(place.transferredAt).not.toBeNull();

    // La tontine n'exige pas de vérification, mais une place transférée si.
    await pay(t.id);
    await syncTontine(t.id);
    const r1 = await db.round.findFirstOrThrow({ where: { tontineId: t.id, number: 1 }, include: { payouts: true } });
    expect(r1.payouts[0]).toMatchObject({ status: "FAILED", error: expect.stringContaining("non vérifié") });

    await sendVerificationCode(m1.id);
    const code = (await db.notification.findFirstOrThrow({ where: { phone: heir.phone, body: { contains: "code" } } })).body.match(/(\d{6})/)![1];
    await checkVerificationCode(m1.id, code);
    expect(await db.payout.findFirstOrThrow({ where: { roundId: r1.id } })).toMatchObject({ status: "PAID" });
    expect(await db.auditEntry.count({ where: { tontineId: t.id, action: { in: ["INCIDENT_REPORTED", "EVIDENCE_RECORDED", "INCIDENT_TRANSFER"] } } })).toBe(3);
  });
});

describe("messages vocaux en wolof", () => {
  it("double les messages des membres qui l'ont choisi et annonce les cotisations reçues au bénéficiaire", async () => {
    const u = await owner();
    const { createTontine } = await import("@/lib/tontine");
    const t = await createTontine(u.id, {
      name: "Natt Médina", type: "ROTATING", amountXof: 25_000, frequency: "monthly", orderMode: "MANUAL", latePenaltyXof: 0, guaranteeBps: 0,
      members: [{ name: "Awa", phone: u.phone, network: "wave" }, ...people(3)],
    });
    const awa = await member(t.id, 1);
    await setVoiceNotes(awa.id, true, u.id);

    await simulateMockPayment((await currentRound(t.id)).contributions.find((c) => c.member.position === 2)!.invoiceId!);
    await syncTontine(t.id);
    const voice = await db.notification.findFirstOrThrow({ where: { channel: "voice", phone: awa.phone } });
    expect(voice.body).toBe("Salaam aleekum Awa. Natt Natt Médina : natt bu M1, 25 000 FCFA, agsi na. Des na 3 natt balaa ñuy yónne xaalis bi.");

    await sendAnnouncement(t.id, "Ndaje ci altine ci 18h", { id: u.id, name: "Awa" });
    expect(await db.notification.count({ where: { body: { contains: "Ndaje" } } })).toBe(5); // 4 textes + 1 vocal
  });
});
