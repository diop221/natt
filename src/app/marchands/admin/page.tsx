import { ActionForm } from "@/components/ActionForm";
import { AdminOnly } from "@/components/AdminOnly";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NETWORKS } from "@/lib/format";
import { getDict } from "@/lib/i18n";
import { MERCHANT_CATEGORIES, isNattAdmin } from "@/lib/merchants";
import { formatXof } from "@/lib/money";
import { createMerchantAction, createOfferAction, toggleMerchantAction, toggleOfferAction, verifyMerchantAction } from "../actions";

export const dynamic = "force-dynamic";

const card = "card space-y-3 p-5";
const input = "input";
const button = "btn";
const link = "link";

// Équipe Natt : marchands partenaires, vérification de leur numéro de paiement, offres.
export default async function MerchantsAdmin() {
  const user = await requireUser("/marchands/admin");
  if (!isNattAdmin(user)) return <AdminOnly />;
  const [t, merchants] = await Promise.all([
    getDict(),
    db.merchant.findMany({ include: { offers: { orderBy: { createdAt: "desc" } }, _count: { select: { orders: true } } }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t.merchants.admin}</h1>

      <section className={card}>
        <h2 className="font-semibold">Nouveau marchand</h2>
        <ActionForm action={createMerchantAction} className="grid gap-2 sm:grid-cols-2">
          <input name="name" required maxLength={80} placeholder="Nom" className={input} />
          <select name="category" className={input}>
            {MERCHANT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{t.merchants.categories[c]}</option>
            ))}
          </select>
          <input name="city" required maxLength={60} placeholder="Ville" className={input} />
          <input name="description" maxLength={300} placeholder="Description" className={input} />
          <input name="phone" type="tel" required placeholder="Numéro de paiement" className={input} />
          <select name="network" className={input}>
            {Object.entries(NETWORKS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            Commission (%)
            <input name="commissionPct" type="number" min={0} max={20} step={0.5} defaultValue={4} className={`${input} w-24`} />
          </label>
          <button className={`${button} sm:justify-self-start`}>Ajouter</button>
        </ActionForm>
      </section>

      {merchants.map((m) => (
        <section key={m.id} className={card}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">
              {m.name} <span className="text-sm font-normal text-muted">· {t.merchants.categories[m.category as keyof typeof t.merchants.categories]} · {m.city}</span>
            </h2>
            <span className="text-sm text-muted">
              {NETWORKS[m.network]} {m.phone} · commission {(m.commissionBps / 100).toLocaleString("fr-FR")} % · {m._count.orders} commande(s)
            </span>
          </div>
          <div className="flex flex-wrap gap-4">
            {m.verifiedAt ? (
              <span className="text-sm text-accent">Numéro vérifié ✓</span>
            ) : (
              <ActionForm action={verifyMerchantAction}>
                <input type="hidden" name="merchantId" value={m.id} />
                <button className={link} title="Après avoir vérifié le numéro avec le marchand (contrat, appel, paiement test)">
                  Marquer le numéro comme vérifié
                </button>
              </ActionForm>
            )}
            <ActionForm action={toggleMerchantAction}>
              <input type="hidden" name="merchantId" value={m.id} />
              <input type="hidden" name="active" value={m.active ? "0" : "1"} />
              <button className="text-sm text-muted underline">{m.active ? "Désactiver" : "Réactiver"}</button>
            </ActionForm>
          </div>
          <ul className="divide-y divide-border text-sm">
            {m.offers.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className={o.active ? "" : "text-muted line-through"}>
                  {o.title} · {formatXof(o.nattPriceXof)} <span className="text-muted">({formatXof(o.priceXof)})</span>
                </span>
                <ActionForm action={toggleOfferAction}>
                  <input type="hidden" name="offerId" value={o.id} />
                  <input type="hidden" name="active" value={o.active ? "0" : "1"} />
                  <button className="text-sm text-muted underline">{o.active ? "Retirer" : "Republier"}</button>
                </ActionForm>
              </li>
            ))}
          </ul>
          <details>
            <summary className={`${link} cursor-pointer`}>Nouvelle offre</summary>
            <ActionForm action={createOfferAction} className="mt-3 grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="merchantId" value={m.id} />
              <input name="title" required maxLength={80} placeholder="Titre" className={input} />
              <input name="description" maxLength={300} placeholder="Description" className={input} />
              <input name="priceXof" type="number" min={100} step={100} required placeholder="Prix public (FCFA)" className={input} />
              <input name="nattPriceXof" type="number" min={100} step={100} required placeholder="Prix Natt (FCFA)" className={input} />
              <input name="delivery" maxLength={200} placeholder="Livraison ou retrait" className={`${input} sm:col-span-2`} />
              <button className={`${button} sm:justify-self-start`}>Publier</button>
            </ActionForm>
          </details>
        </section>
      ))}
    </div>
  );
}
