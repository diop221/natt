import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { toCsv, tontineTotals } from "@/lib/report";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const org = await db.organization.findFirst({ where: { id, members: { some: { userId: user?.id ?? "" } } }, include: { tontines: true } });
  if (!user || !org) return new Response("Introuvable", { status: 404 });
  const totals = await tontineTotals(org.tontines.map((t) => t.id));
  const csv = toCsv([
    ["Caisse", "Type", "Statut", "Collecté (FCFA)", "Versé (FCFA)", "Commission (FCFA)", "En caisse (FCFA)"],
    ...totals.map((t) => [t.name, t.type, t.status, t.collectedXof, t.paidOutXof, t.feesXof, t.fundXof]),
  ]);
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="natt-${org.id}.csv"` },
  });
}
