import { NewTontineForm } from "@/components/NewTontineForm";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { feeBps } from "@/lib/money";

export default async function NewTontinePage({ searchParams }: { searchParams: Promise<{ offer?: string }> }) {
  const user = await requireUser("/tontines/new");
  const { offer: offerId } = await searchParams;
  const [orgs, offer] = await Promise.all([
    db.organization.findMany({
      where: { members: { some: { userId: user.id, role: "ADMIN" } } },
      select: { id: true, name: true },
    }),
    // Natt Marchands : tontine pour financer une offre du catalogue.
    offerId ? db.offer.findFirst({ where: { id: offerId, active: true, merchant: { active: true } }, include: { merchant: true } }) : null,
  ]);
  // L'organisateur est proposé comme premier membre ; il peut se retirer ou changer de place.
  return (
    <NewTontineForm
      me={{ name: user.name, phone: user.phone, network: "wave", sponsorPhone: "" }}
      orgs={orgs}
      feePct={feeBps() / 100}
      offer={offer && { id: offer.id, title: offer.title, merchant: offer.merchant.name, nattPriceXof: offer.nattPriceXof }}
    />
  );
}
