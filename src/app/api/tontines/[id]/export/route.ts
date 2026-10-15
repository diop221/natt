import { canViewTontine } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { toCsv } from "@/lib/report";

// Historique complet d'une tontine : cotisations, pénalités, versements et mouvements du fonds.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !(await canViewTontine(user.id, id))) return new Response("Introuvable", { status: 404 });
  const t = await db.tontine.findUniqueOrThrow({
    where: { id },
    include: {
      rounds: { include: { contributions: { include: { member: true } } }, orderBy: { number: "asc" } },
      charges: { include: { member: true } },
      payouts: { include: { member: true } },
      fundEntries: true,
    },
  });
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  const rows: (string | number)[][] = [["Date", "Type", "Tour", "Membre", "Montant (FCFA)", "Statut"]];
  for (const r of t.rounds) {
    for (const c of r.contributions) {
      rows.push([day(c.paidAt), "Cotisation", r.number, c.member.name, c.amountXof - c.creditUsedXof + c.guaranteeXof, c.status]);
    }
  }
  for (const ch of t.charges) rows.push([day(ch.paidAt ?? ch.createdAt), ch.kind === "PENALTY" ? "Pénalité" : "Remboursement", "", ch.member.name, ch.amountXof, ch.status]);
  for (const p of t.payouts) rows.push([day(p.paidAt ?? p.createdAt), "Versement", "", p.member.name, p.amountXof, p.status]);
  for (const f of t.fundEntries) rows.push([day(f.createdAt), "Fonds", "", f.label, f.amountXof, f.reason]);
  return new Response(toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="natt-${t.id}.csv"` },
  });
}
