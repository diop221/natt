import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDict, tf } from "@/lib/i18n";
import { MERCHANT_CATEGORIES, isNattAdmin, listOffers } from "@/lib/merchants";
import { formatXof } from "@/lib/money";

export const dynamic = "force-dynamic";

// Catalogue Natt Marchands : offres des marchands partenaires, à financer avec une tontine.
export default async function MerchantsPage({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const user = await requireUser("/marchands");
  const { cat } = await searchParams;
  const category = MERCHANT_CATEGORIES.find((c) => c === cat);
  const [t, offers] = await Promise.all([getDict(), listOffers(category)]);
  const chip = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-sm font-medium transition ${active ? "bg-accent text-black" : "border border-border text-muted hover:border-accent hover:text-foreground"}`;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold">{t.merchants.title}</h1>
          {isNattAdmin(user) && (
            <Link href="/marchands/admin" className="link">
              {t.merchants.admin}
            </Link>
          )}
        </div>
        <p className="text-muted">{t.merchants.help}</p>
      </section>

      <nav className="flex flex-wrap gap-2">
        <Link href="/marchands" className={chip(!category)}>
          {t.merchants.all}
        </Link>
        {MERCHANT_CATEGORIES.map((c) => (
          <Link key={c} href={`/marchands?cat=${c}`} className={chip(category === c)}>
            {t.merchants.categories[c]}
          </Link>
        ))}
      </nav>

      {offers.length === 0 ? (
        <p className="text-muted">{t.merchants.none}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {offers.map((o) => (
            <li key={o.id} className="flex flex-col gap-2 card p-4">
              <p className="text-xs font-medium text-accent">{t.merchants.categories[o.category as keyof typeof t.merchants.categories]}</p>
              <h2 className="font-semibold">{o.title}</h2>
              <p className="text-sm text-muted">
                {tf(t.purchase.by, { merchant: o.merchant.name, city: o.merchant.city })} · {o.description}
              </p>
              <p>
                <span className="text-xl font-bold text-accent">{formatXof(o.nattPriceXof)}</span>
                {o.priceXof > o.nattPriceXof && (
                  <span className="ml-2 text-sm text-muted line-through" title={t.merchants.publicPrice}>
                    {formatXof(o.priceXof)}
                  </span>
                )}
              </p>
              {o.delivery && <p className="text-sm text-muted">{o.delivery}</p>}
              <p className="text-xs text-muted">{tf(t.merchants.commission, { pct: (o.merchant.commissionBps / 100).toLocaleString("fr-FR") })}</p>
              {!o.merchant.verifiedAt && <p className="text-xs text-warn">{t.merchants.unverified}</p>}
              <Link
                href={`/tontines/new?offer=${o.id}`}
                className="mt-auto self-start btn"
              >
                {t.merchants.start}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
