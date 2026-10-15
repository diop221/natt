import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  Coins,
  FileCheck,
  HeartHandshake,
  MessageSquareWarning,
  Store,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { AdminOnly } from "@/components/AdminOnly";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getDict } from "@/lib/i18n";
import { isNattAdmin } from "@/lib/merchants";
import { formatXof } from "@/lib/money";

export const dynamic = "force-dynamic";

const WEEKS = 8;
const DAY = 24 * 3600 * 1000;

// Tableau de bord de l'équipe Natt (NATT_ADMIN_PHONES) : activité, revenus et points d'attention.
export default async function AdminPage() {
  const user = await requireUser("/admin");
  if (!isNattAdmin(user)) return <AdminOnly />;
  const t = await getDict();
  const now = new Date();
  const since = new Date(now.getTime() - WEEKS * 7 * DAY);

  const [
    users,
    tontinesByStatus,
    paidContribs,
    cashPayouts,
    fees,
    commissions,
    certificates,
    failedPayouts,
    openIncidents,
    failedMessages,
    unverifiedMerchants,
    recentTontines,
    weekly,
  ] = await Promise.all([
    db.user.count(),
    db.tontine.groupBy({ by: ["status"], _count: true }),
    db.contribution.aggregate({ where: { status: "paid" }, _sum: { amountXof: true, guaranteeXof: true, sats: true }, _count: true }),
    db.payout.aggregate({ where: { status: "PAID", merchantId: null }, _sum: { amountXof: true }, _count: true }),
    db.payout.aggregate({ where: { status: "PAID", merchantId: null }, _sum: { feeXof: true } }),
    db.payout.aggregate({ where: { status: "PAID", merchantId: { not: null } }, _sum: { feeXof: true, amountXof: true }, _count: true }),
    db.certificate.aggregate({ where: { status: { in: ["ISSUED", "REVOKED"] } }, _sum: { priceXof: true }, _count: true }),
    db.payout.findMany({ where: { status: "FAILED" }, include: { tontine: true, member: true }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.incident.findMany({ where: { status: "OPEN" }, include: { tontine: true, member: true }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.notification.count({ where: { status: "FAILED", createdAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
    db.merchant.findMany({ where: { verifiedAt: null, active: true }, include: { _count: { select: { orders: true } } } }),
    db.tontine.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { owner: true, _count: { select: { members: true } } } }),
    db.contribution.findMany({ where: { status: "paid", paidAt: { gte: since } }, select: { paidAt: true, amountXof: true, guaranteeXof: true } }),
  ]);

  const count = (s: string) => tontinesByStatus.find((x) => x.status === s)?._count ?? 0;
  const totalTontines = tontinesByStatus.reduce((s, x) => s + x._count, 0);
  const volume = (paidContribs._sum.amountXof ?? 0) + (paidContribs._sum.guaranteeXof ?? 0);
  const revenue = (fees._sum.feeXof ?? 0) + (commissions._sum.feeXof ?? 0) + (certificates._sum.priceXof ?? 0);

  // Volume cotisé par semaine (8 dernières semaines, la plus récente à droite).
  const weeks = Array.from({ length: WEEKS }, (_, i) => {
    const start = new Date(since.getTime() + i * 7 * DAY);
    return { start, xof: 0 };
  });
  for (const c of weekly) {
    const i = Math.min(WEEKS - 1, Math.floor((c.paidAt!.getTime() - since.getTime()) / (7 * DAY)));
    weeks[i].xof += c.amountXof + c.guaranteeXof;
  }
  const max = Math.max(...weeks.map((w) => w.xof), 1);

  const kpis = [
    { icon: Users, label: "Membres inscrits", value: users.toLocaleString("fr-FR"), sub: `${totalTontines} tontines · ${count("ACTIVE")} en cours` },
    { icon: Zap, label: "Cotisé en Lightning", value: formatXof(volume), sub: `${(paidContribs._sum.sats ?? 0).toLocaleString("fr-FR")} sats · ${paidContribs._count} paiements` },
    { icon: Wallet, label: "Versé sur mobile money", value: formatXof(cashPayouts._sum.amountXof ?? 0), sub: `${cashPayouts._count} versements` },
    { icon: TrendingUp, label: "Revenus Natt", value: formatXof(revenue), sub: "commissions, marchands, attestations" },
  ];
  const revenueLines = [
    { icon: Coins, label: "Commission sur versements", value: fees._sum.feeXof ?? 0 },
    { icon: Store, label: `Commissions marchands (${commissions._count} ventes)`, value: commissions._sum.feeXof ?? 0 },
    { icon: FileCheck, label: `Attestations (${certificates._count})`, value: certificates._sum.priceXof ?? 0 },
  ];
  const alerts = failedPayouts.length + openIncidents.length + unverifiedMerchants.length + (failedMessages > 0 ? 1 : 0);

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="eyebrow">Équipe Natt</p>
          <h1 className="text-3xl font-bold tracking-tight">Administration</h1>
          <p className="text-muted">Activité de la plateforme, revenus et points d&apos;attention.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/marchands/admin" className="btn-ghost">
            <Store size={16} /> {t.merchants.admin}
          </Link>
          {process.env.PAYMENT_PROVIDER !== "bitnob" && (
            <Link href="/dev/messages" className="btn-ghost">
              <Zap size={16} /> {t.nav.messages}
            </Link>
          )}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map(({ icon: Icon, label, value, sub }) => (
          <div key={label} className="card space-y-3 p-4">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Icon size={18} />
            </span>
            <div>
              <p className="text-xs text-muted">{label}</p>
              <p className="text-xl font-bold tracking-tight">{value}</p>
              <p className="text-xs text-muted">{sub}</p>
            </div>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="card space-y-5 p-5">
          <div>
            <h2 className="font-semibold">Volume cotisé par semaine</h2>
            <p className="text-sm text-muted">Cotisations payées en Lightning, en FCFA, sur les {WEEKS} dernières semaines.</p>
          </div>
          <div className="flex h-48 items-end gap-[2px] border-b border-border" role="img" aria-label="Volume cotisé par semaine">
            {weeks.map((w) => (
              <div key={w.start.toISOString()} className="group relative flex h-full flex-1 items-end justify-center">
                <div
                  className="w-full max-w-10 rounded-t-[4px] bg-chart transition group-hover:brightness-110"
                  style={{ height: `${Math.max((w.xof / max) * 100, w.xof ? 2 : 0)}%` }}
                />
                <span className="pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-lg border border-border bg-surface px-2 py-1 text-xs whitespace-nowrap shadow-lg group-hover:block">
                  <span className="block text-muted">Semaine du {formatDate(w.start)}</span>
                  <span className="font-semibold">{formatXof(w.xof)}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-[2px] text-[11px] text-muted">
            {weeks.map((w) => (
              <span key={w.start.toISOString()} className="flex-1 text-center">
                {w.start.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
              </span>
            ))}
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">Voir les valeurs</summary>
            <table className="mt-2 w-full text-left">
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.start.toISOString()} className="border-b border-border">
                    <td className="py-1 text-muted">Semaine du {formatDate(w.start)}</td>
                    <td className="py-1 text-right font-medium">{formatXof(w.xof)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="font-semibold">Revenus Natt</h2>
          <p className="text-3xl font-extrabold tracking-tight">{formatXof(revenue)}</p>
          <ul className="space-y-3 text-sm">
            {revenueLines.map(({ icon: Icon, label, value }) => (
              <li key={label} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-muted">
                  <Icon size={15} /> {label}
                </span>
                <span className="font-semibold whitespace-nowrap">{formatXof(value)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">
            Les réserves de fin de cycle et les fonds de garantie appartiennent aux membres : ils ne sont pas comptés ici.
          </p>
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <AlertTriangle size={18} className={alerts ? "text-warn" : "text-success"} /> À surveiller
          <span className={`badge ${alerts ? "bg-warn-soft text-warn" : "bg-success-soft text-success"}`}>{alerts}</span>
        </h2>
        {alerts === 0 ? (
          <p className="card p-5 text-sm text-muted">Rien à signaler : aucun versement bloqué, aucun dossier ouvert.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {failedPayouts.map((p) => (
              <Link key={p.id} href={`/tontines/${p.tontineId}`} className="card group flex items-start gap-3 p-4 transition hover:border-accent/50">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger">
                  <Banknote size={17} />
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block font-semibold">
                    Versement en attente · {formatXof(p.amountXof)}
                  </span>
                  <span className="block text-muted">
                    {p.tontine.name} · {p.member.name}
                  </span>
                  <span className="block truncate text-xs text-danger">{p.error}</span>
                </span>
                <ArrowUpRight size={16} className="text-muted group-hover:text-accent" />
              </Link>
            ))}
            {openIncidents.map((i) => (
              <Link key={i.id} href={`/tontines/${i.tontineId}`} className="card group flex items-start gap-3 p-4 transition hover:border-accent/50">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warn-soft text-warn">
                  <HeartHandshake size={17} />
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block font-semibold">Situation exceptionnelle · {t.incident.kinds[i.kind as keyof typeof t.incident.kinds]}</span>
                  <span className="block text-muted">
                    {i.tontine.name} · {i.member.name} · {formatDate(i.createdAt)}
                  </span>
                </span>
                <ArrowUpRight size={16} className="text-muted group-hover:text-accent" />
              </Link>
            ))}
            {unverifiedMerchants.map((m) => (
              <Link key={m.id} href="/marchands/admin" className="card group flex items-start gap-3 p-4 transition hover:border-accent/50">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warn-soft text-warn">
                  <Store size={17} />
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block font-semibold">Marchand à vérifier · {m.name}</span>
                  <span className="block text-muted">
                    {m.city} · {m._count.orders} commande(s) en attente de son numéro
                  </span>
                </span>
                <ArrowUpRight size={16} className="text-muted group-hover:text-accent" />
              </Link>
            ))}
            {failedMessages > 0 && (
              <div className="card flex items-start gap-3 p-4">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger">
                  <MessageSquareWarning size={17} />
                </span>
                <span className="text-sm">
                  <span className="block font-semibold">{failedMessages} message(s) WhatsApp en échec</span>
                  <span className="block text-muted">Sur les 7 derniers jours : vérifiez la configuration WhatsApp et la synthèse vocale.</span>
                </span>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Dernières tontines</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-border">
                <th className="px-4 py-3 font-medium">Tontine</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Organisateur</th>
                <th className="px-4 py-3 text-right font-medium">Membres</th>
                <th className="px-4 py-3 text-right font-medium">Cotisation</th>
                <th className="px-4 py-3 font-medium">Avancement</th>
              </tr>
            </thead>
            <tbody>
              {recentTontines.map((x) => (
                <tr key={x.id} className="border-b border-border last:border-0 hover:bg-surface-2/60">
                  <td className="px-4 py-3">
                    <Link href={`/tontines/${x.id}`} className="font-medium hover:text-accent">
                      {x.name}
                    </Link>
                    <span className="block text-xs text-muted">{formatDate(x.createdAt)}</span>
                  </td>
                  <td className="px-4 py-3 text-muted">{t.types[x.type as keyof typeof t.types]}</td>
                  <td className="px-4 py-3 text-muted">{x.owner.name}</td>
                  <td className="px-4 py-3 text-right">{x._count.members}</td>
                  <td className="px-4 py-3 text-right">{formatXof(x.amountXof)}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${x.status === "ACTIVE" ? "badge-accent" : x.status === "COMPLETED" ? "bg-success-soft text-success" : ""}`}>
                      {x.status === "ACTIVE" ? `Tour ${x.currentRound}/${x.totalRounds}` : t.status[x.status as "DRAWING" | "COMPLETED"]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
