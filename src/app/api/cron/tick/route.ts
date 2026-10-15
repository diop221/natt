import { db } from "@/lib/db";
import { checkProcessingPayouts, syncTontine } from "@/lib/tontine";

// Tâche planifiée (par exemple Vercel Cron, toutes les 15 minutes) : synchronise toutes les
// tontines en cours, même quand personne n'a de page ouverte. C'est elle qui envoie les rappels
// et applique les pénalités à l'heure.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });

  const tontines = await db.tontine.findMany({
    where: { OR: [{ status: { in: ["ACTIVE", "DRAWING"] } }, { charges: { some: { status: "pending" } } }] },
    select: { id: true },
  });
  const errors: { id: string; error: string }[] = [];
  for (const { id } of tontines) {
    await syncTontine(id).catch((err) => errors.push({ id, error: err instanceof Error ? err.message : String(err) }));
  }
  // Versements en cours de règlement chez l'opérateur (au cas où un webhook se serait perdu).
  await checkProcessingPayouts().catch((err) => errors.push({ id: "payouts", error: err instanceof Error ? err.message : String(err) }));
  return Response.json({ synced: tontines.length, errors });
}
