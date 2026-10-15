import { beforeEach } from "vitest";
import { db } from "@/lib/db";
import { simulateMockPayment } from "@/lib/payments/mock";
import { createTontine, type NewTontine } from "@/lib/tontine";

// Outils communs aux tests du moteur : base vidée avant chaque test, tontine de 3 membres.

beforeEach(async () => {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    select tablename from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
});

export async function owner() {
  return db.user.create({ data: { name: "Awa", phone: "+221770000001", passwordHash: "x" } });
}

export const people = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `M${i + 1}`, phone: `+22178000000${i + 1}`, network: "wave" }));

export async function newTontine(overrides: Partial<NewTontine> = {}) {
  const u = await owner();
  return createTontine(u.id, {
    name: "Test",
    type: "ROTATING",
    amountXof: 10_000,
    frequency: "monthly",
    members: people(3),
    orderMode: "MANUAL",
    latePenaltyXof: 0,
    guaranteeBps: 0,
    ...overrides,
  });
}

export async function currentRound(tontineId: string) {
  const t = await db.tontine.findUniqueOrThrow({ where: { id: tontineId } });
  return db.round.findUniqueOrThrow({
    where: { tontineId_number: { tontineId, number: t.currentRound } },
    include: { contributions: { include: { member: true } } },
  });
}

// Paie les cotisations en attente du tour en cours (toutes, ou celles des positions données).
export async function pay(tontineId: string, positions?: number[]) {
  const round = await currentRound(tontineId);
  for (const c of round.contributions) {
    if (c.status === "pending" && (!positions || positions.includes(c.member.position))) await simulateMockPayment(c.invoiceId!);
  }
}

