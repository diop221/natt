import type { CertificatePayload } from "@/lib/certificates";
import { formatDate } from "@/lib/format";
import type { Dict } from "@/lib/i18n/fr";
import { tf } from "@/lib/i18n/tf";
import { formatXof } from "@/lib/money";

// Contenu signé d'une attestation, affiché à l'identique sur le document du titulaire
// et sur le portail de vérification.
export function CertificateView({ p, t, locale }: { p: CertificatePayload; t: Dict; locale: string }) {
  const c = t.certificate;
  const d = (iso: string) => formatDate(new Date(iso), locale);
  // Même liste de lignes pour toutes les colonnes : la ligne « achats » n'apparaît que s'il y en a au total.
  const withPurchases = p.totals.purchasesXof > 0;
  const rows = (l: CertificatePayload["totals"]) =>
    [
      [c.recorded, `${l.recordedCount} · ${formatXof(l.recordedXof)}`],
      [c.paid, formatXof(l.paidXof)],
      [c.onTime, l.onTime],
      [c.late, l.late],
      [c.covered, l.covered],
      [c.missed, l.missed],
      [c.received, formatXof(l.potsReceivedXof)],
      ...(withPurchases ? [[c.purchases, formatXof(l.purchasesXof)] as const] : []),
      [c.outstanding, formatXof(l.outstandingXof)],
    ] as const;

  return (
    <div className="space-y-4">
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted">{c.number}</dt>
        <dd className="font-mono">{p.number}</dd>
        <dt className="text-muted">{c.holder}</dt>
        <dd>
          <span className="font-medium">{p.holder.name}</span> · {p.holder.phone} · {c.identity[p.holder.identity]}
        </dd>
        {p.period && (
          <>
            <dt className="text-muted">{c.period}</dt>
            <dd>
              {d(p.period.from)} → {d(p.period.to)}
            </dd>
          </>
        )}
        <dt className="text-muted">{c.score}</dt>
        <dd>{p.score === null ? t.score.tooShort : `${p.score}/100`}</dd>
      </dl>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="py-1 pr-3 font-normal" />
              <th className="py-1 pr-3 font-medium text-foreground">{c.totals}</th>
              {p.tontines.map((x, i) => (
                <th key={i} className="py-1 pr-3 font-normal">
                  {x.name}
                  <span className="block text-xs">
                    {x.from && x.to ? `${d(x.from)} → ${d(x.to)}` : ""}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows(p.totals).map(([label, total], r) => (
              <tr key={label} className="border-b border-border">
                <td className="py-1 pr-3 text-muted">{label}</td>
                <td className="py-1 pr-3 font-medium">{total}</td>
                {p.tontines.map((x, i) => (
                  <td key={i} className="py-1 pr-3">
                    {rows(x)[r]?.[1]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-muted">{tf(c.issued, { date: d(p.issuedAt), expires: d(p.expiresAt) })}</p>
      <p className="rounded-lg bg-warn-soft p-3 text-xs text-warn">{p.disclaimer}</p>
    </div>
  );
}
