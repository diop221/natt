import { db } from "@/lib/db";

// Totaux d'une tontine pour les rapports : collecté, versé, en caisse.
export async function tontineTotals(tontineIds: string[]) {
  const [collected, paidOut, tontines] = await Promise.all([
    db.contribution.groupBy({
      by: ["roundId"],
      where: { round: { tontineId: { in: tontineIds } }, status: "paid" },
      _sum: { amountXof: true, guaranteeXof: true, creditUsedXof: true },
    }),
    db.payout.groupBy({ by: ["tontineId"], where: { tontineId: { in: tontineIds }, status: "PAID" }, _sum: { amountXof: true, feeXof: true } }),
    db.tontine.findMany({ where: { id: { in: tontineIds } }, include: { rounds: { select: { id: true } } } }),
  ]);
  return tontines.map((t) => {
    const roundIds = new Set(t.rounds.map((r) => r.id));
    const c = collected.filter((x) => roundIds.has(x.roundId));
    const p = paidOut.find((x) => x.tontineId === t.id);
    return {
      id: t.id,
      name: t.name,
      type: t.type,
      status: t.status,
      collectedXof: c.reduce((s, x) => s + (x._sum.amountXof ?? 0) - (x._sum.creditUsedXof ?? 0) + (x._sum.guaranteeXof ?? 0), 0),
      paidOutXof: p?._sum.amountXof ?? 0,
      feesXof: p?._sum.feeXof ?? 0,
      fundXof: t.fundXof,
    };
  });
}

export function toCsv(rows: (string | number)[][]) {
  const cell = (v: string | number) => (/[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  // Séparateur « ; » et BOM UTF-8 : le fichier s'ouvre correctement dans Excel en français.
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\n");
}
