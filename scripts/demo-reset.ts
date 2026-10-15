// Remet la « Tontine du quartier » dans l'état de départ de la démo :
// 4 membres aux numéros vérifiés, 10 000 FCFA, tour 1 pour Fatou,
// Fatou, Awa et Moussa ont payé, il ne manque qu'Ibrahima.
//
//   npm run demo:reset
//
// Ne tourne que sur une base locale (127.0.0.1 / localhost) : jamais sur Supabase.
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const TONTINE = "Tontine du quartier";
const PASSWORD = "natt2026";
const PEOPLE = [
  { name: "Fatou Sow", phone: "+221770000003", network: "wave" },
  { name: "Awa Ndiaye", phone: "+221770000001", network: "wave" },
  { name: "Moussa Diallo", phone: "+221770000002", network: "orange_money" },
  { name: "Ibrahima Fall", phone: "+221770000004", network: "wave" },
];
const OWNER = PEOPLE[1];

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const host = url.match(/@([^:/?]+)/)?.[1];
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Base « ${host ?? "inconnue"} » refusée : ce script ne tourne que sur une base locale.`);
  }
  if ((process.env.PAYMENT_PROVIDER ?? "mock") !== "mock") {
    throw new Error("Les paiements de départ sont simulés : lancez le script avec PAYMENT_PROVIDER=mock.");
  }

  const { db } = await import("@/lib/db");
  const { hashPassword } = await import("@/lib/auth");
  const { createTontine, syncTontine } = await import("@/lib/tontine");
  const { simulateMockPayment } = await import("@/lib/payments/mock");

  // Comptes de démo : créés s'ils manquent, mot de passe remis à natt2026.
  const passwordHash = await hashPassword(PASSWORD);
  for (const p of PEOPLE) {
    await db.user.upsert({
      where: { phone: p.phone },
      update: { passwordHash },
      create: { name: p.name.split(" ")[0], phone: p.phone, passwordHash },
    });
  }
  const owner = await db.user.findUniqueOrThrow({ where: { phone: OWNER.phone } });

  const { count } = await db.tontine.deleteMany({ where: { ownerId: owner.id, name: TONTINE } });

  const tontine = await createTontine(owner.id, {
    name: TONTINE,
    type: "ROTATING",
    amountXof: 10_000,
    frequency: "monthly",
    members: PEOPLE,
    orderMode: "MANUAL",
    latePenaltyXof: 0,
    guaranteeBps: 0,
    verifyPayouts: true,
  });
  await db.member.updateMany({ where: { tontineId: tontine.id }, data: { verifiedAt: new Date(), verifiedVia: "OTP" } });

  const round = await db.round.findUniqueOrThrow({
    where: { tontineId_number: { tontineId: tontine.id, number: 1 } },
    include: { contributions: { include: { member: true } } },
  });
  for (const c of round.contributions) {
    if (c.member.phone !== PEOPLE[3].phone) await simulateMockPayment(c.invoiceId!);
  }
  await syncTontine(tontine.id);

  const ibrahima = round.contributions.find((c) => c.member.phone === PEOPLE[3].phone)!;
  const base = process.env.APP_URL ?? "http://localhost:3000";
  console.log(`${count ? "Ancienne tontine supprimée. " : ""}« ${TONTINE} » prête : 3/4 payé, il ne manque qu'Ibrahima.`);
  console.log(`  Tontine (connecté en Awa ${OWNER.phone} / ${PASSWORD}) : ${base}/tontines/${tontine.id}`);
  console.log(`  Paiement d'Ibrahima : ${base}/pay/${ibrahima.id}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
