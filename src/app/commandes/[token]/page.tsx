import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { deliveredAction } from "@/app/marchands/actions";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getDict, getLocale, tf } from "@/lib/i18n";
import { formatXof } from "@/lib/money";

export const dynamic = "force-dynamic";

// Page publique du marchand, ouverte depuis le lien secret reçu par WhatsApp :
// il voit la commande et indique la livraison. Rien d'autre sur la tontine.
export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const order = await db.order.findUnique({ where: { token }, include: { offer: true, merchant: true, member: true } });
  if (!order) notFound();
  const [t, locale] = await Promise.all([getDict(), getLocale()]);

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <p className="text-sm text-muted">{order.merchant.name}</p>
      <h1 className="text-2xl font-bold">{t.purchase.merchantTitle}</h1>
      <div className="space-y-1 card p-4">
        <p className="text-lg font-semibold">{order.offer.title}</p>
        <p>{tf(t.purchase.merchantFor, { member: order.member.name, phone: order.member.phone })}</p>
        <p className="text-sm text-muted">
          {tf(t.purchase.merchantPaid, {
            amount: formatXof(order.priceXof - order.commissionXof),
            price: formatXof(order.priceXof),
            commission: formatXof(order.commissionXof),
          })}
        </p>
        {order.offer.delivery && <p className="text-sm text-muted">{order.offer.delivery}</p>}
        <p className="text-sm font-medium">{t.purchase.statuses[order.status as keyof typeof t.purchase.statuses]}</p>
      </div>
      {order.status === "PAYING" && <p className="text-sm text-warn">{t.purchase.notPaidYet}</p>}
      {order.status === "PAID" && (
        <ActionForm action={deliveredAction}>
          <input type="hidden" name="token" value={order.token} />
          <button className="btn w-full">{t.purchase.markDelivered}</button>
        </ActionForm>
      )}
      {order.deliveredAt && (
        <p className="rounded-xl bg-accent-soft p-4 text-accent">{tf(t.purchase.delivered, { date: formatDate(order.deliveredAt, locale) })}</p>
      )}
    </div>
  );
}
