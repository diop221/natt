import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { ScoreCard } from "@/components/ScoreCard";
import { requireUser } from "@/lib/auth";
import { certificatePrice } from "@/lib/certificates";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getDict, getLocale, tf } from "@/lib/i18n";
import { formatXof } from "@/lib/money";
import { reliability } from "@/lib/score";
import { requestCertificateAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ScorePage() {
  const user = await requireUser("/score");
  const [t, locale, r, certificates] = await Promise.all([
    getDict(),
    getLocale(),
    reliability(user.id),
    db.certificate.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const price = certificatePrice();

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-bold">{t.score.title}</h1>
        <p className="text-sm text-muted">{t.score.help}</p>
        <ScoreCard r={r} t={t} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t.certificate.title}</h2>
        <p className="text-sm text-muted">{t.certificate.help}</p>
        <p className="text-sm">{price > 0 ? tf(t.certificate.price, { price: formatXof(price) }) : t.certificate.free}</p>
        <ActionForm action={requestCertificateAction}>
          <button className="btn">{t.certificate.request}</button>
        </ActionForm>
        {certificates.length > 0 && (
          <>
            <h3 className="text-sm font-medium">{t.certificate.mine}</h3>
            <ul className="divide-y divide-border card text-sm">
              {certificates.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <span>
                    <span className="font-mono">{c.number}</span>
                    <span className="ml-2 text-muted">
                      {t.certificate.statuses[c.status as keyof typeof t.certificate.statuses]}
                      {c.issuedAt && ` · ${formatDate(c.issuedAt, locale)}`}
                    </span>
                  </span>
                  <Link href={`/attestations/${c.id}`} className="font-medium text-accent">
                    {t.certificate.open}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
