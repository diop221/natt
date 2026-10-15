import { db } from "@/lib/db";

// Score de fiabilité d'un compte, sur toutes ses tontines :
// une cotisation payée à temps compte 1, payée en retard 0,5, avancée par le fonds ou impayée 0.
// Seules les cotisations déjà échues (ou payées) sont prises en compte.
export async function reliability(userId: string, now = new Date()) {
  const contributions = await db.contribution.findMany({
    where: { member: { userId }, OR: [{ status: { in: ["paid", "covered"] } }, { round: { dueAt: { lt: now } } }] },
    include: { round: { select: { dueAt: true } } },
  });
  let onTime = 0;
  let late = 0;
  let missed = 0;
  for (const c of contributions) {
    if (c.status === "paid" && c.paidAt && c.paidAt <= c.round.dueAt) onTime++;
    else if (c.status === "paid") late++;
    else missed++;
  }
  const penalties = await db.charge.count({ where: { member: { userId }, kind: "PENALTY" } });
  const total = onTime + late + missed;
  return {
    total,
    onTime,
    late,
    missed,
    penalties,
    // En dessous de 3 cotisations, l'historique est trop court pour noter.
    score: total >= 3 ? Math.round((100 * (onTime + 0.5 * late)) / total) : null,
  };
}

export type Reliability = Awaited<ReturnType<typeof reliability>>;
