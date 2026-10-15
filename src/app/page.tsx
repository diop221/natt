import { ArrowRight, Award, CalendarClock, FileCheck, Plus, Store, Wallet, Zap } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/Brand";
import { Landing } from "@/components/Landing";
import { visibleTo } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getDict, getLocale, tf } from "@/lib/i18n";
import { formatXof } from "@/lib/money";
import { reliability } from "@/lib/score";
import { addPeriods } from "@/lib/tontine";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  if (!user) return <Landing locale={locale} />;

  const t = await getDict();
  const mine = { OR: [{ userId: user.id }, { sponsorUserId: user.id }] };
  const [tontines, contributions, charges, received, hands, r] = await Promise.all([
    db.tontine.findMany({
      where: visibleTo(user.id),
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: { members: { select: { name: true }, orderBy: { position: "asc" } }, rounds: { include: { contributions: { select: { status: true } } } } },
    }),
    db.contribution.findMany({
      where: { status: "pending", member: mine, round: { status: "COLLECTING" } },
      include: { member: true, round: { include: { tontine: true } } },
      orderBy: { round: { dueAt: "asc" } },
    }),
    db.charge.findMany({ where: { status: "pending", member: mine }, include: { member: true, tontine: true } }),
    db.payout.aggregate({ where: { status: "PAID", merchantId: null, member: { userId: user.id } }, _sum: { amountXof: true } }),
    db.hand.findMany({ where: { holders: { some: { member: { userId: user.id } } }, tontine: { status: "ACTIVE" } }, include: { tontine: true } }),
    reliability(user.id),
  ]);

  const now = new Date();
  const toPay = [
    ...contributions.map((c) => ({
      id: c.id,
      label: c.round.tontine.name,
      sub: `${t.common.round} ${c.round.number} · ${formatDate(c.round.dueAt, locale)}`,
      amount: c.amountXof - c.creditUsedXof + c.guaranteeXof,
      sats: c.sats,
      forName: c.member.userId === user.id ? null : c.member.name,
      late: c.round.dueAt < now,
    })),
    ...charges.map((ch) => ({
      id: ch.id,
      label: ch.tontine.name,
      sub: ch.kind === "PENALTY" ? t.home.penalty : t.home.repayment,
      amount: ch.amountXof,
      sats: ch.sats,
      forName: ch.member.userId === user.id ? null : ch.member.name,
      late: true,
    })),
  ];
  const dueTotal = toPay.reduce((s, p) => s + p.amount, 0);
  // Prochaine cagnotte : la plus proche de mes mains pas encore versées.
  const next = hands
    .filter((h) => h.position >= h.tontine.currentRound)
    .map((h) => ({ date: addPeriods(h.tontine.startAt, h.tontine.frequency, h.position), name: h.tontine.name, amount: h.tontine.amountXof }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0];

  const stats = [
    { icon: Zap, label: t.home.statDue, value: dueTotal ? formatXof(dueTotal) : t.home.statDueNone, hot: dueTotal > 0 },
    { icon: Wallet, label: t.home.statReceived, value: formatXof(received._sum.amountXof ?? 0) },
    { icon: CalendarClock, label: t.home.statNext, value: next ? formatDate(next.date, locale) : t.home.statNextNone, sub: next?.name },
    { icon: Award, label: t.home.statScore, value: r.score === null ? t.home.statScoreNone : `${r.score}/100` },
  ];

  return (
    <div className="space-y-10">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">{tf(t.home.hello, { name: user.name.split(" ")[0] })}</h1>
          <p className="text-muted">{t.home.helloSub}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/marchands" className="btn-ghost">
            <Store size={16} /> {t.home.quickMerchants}
          </Link>
          <Link href="/tontines/new" className="btn">
            <Plus size={16} /> {t.home.create}
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ icon: Icon, label, value, hot, sub }) => (
          <div key={label} className={`card space-y-3 p-4 ${hot ? "border-accent/40 bg-gradient-to-br from-accent-soft to-transparent" : ""}`}>
            <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${hot ? "bg-accent text-black" : "bg-surface-2 text-accent"}`}>
              <Icon size={18} />
            </span>
            <div>
              <p className="text-xs text-muted">{label}</p>
              <p className="text-lg font-bold tracking-tight">{value}</p>
              {sub && <p className="truncate text-xs text-muted">{sub}</p>}
            </div>
          </div>
        ))}
      </section>

      {toPay.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t.home.toPay}</h2>
          <ul className="card divide-y divide-border overflow-hidden">
            {toPay.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${p.late ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent"}`}>
                    <Zap size={18} className="fill-current" />
                  </span>
                  <div>
                    <p className="font-medium">{p.label}</p>
                    <p className="text-sm text-muted">
                      {p.sub}
                      {p.forName && ` · ${tf(t.home.toPayFor, { name: p.forName })}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className={`font-bold ${p.late ? "text-danger" : ""}`}>{formatXof(p.amount)}</p>
                    {p.sats > 0 && <p className="font-mono text-xs text-muted">{p.sats.toLocaleString("fr-FR")} sats</p>}
                  </div>
                  <Link href={`/pay/${p.id}`} className="btn">
                    <Zap size={15} className="fill-current" /> {t.home.payNow}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t.home.myTontines}</h2>
        {tontines.length === 0 ? (
          <div className="card flex flex-col items-center gap-4 p-10 text-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              <Zap size={28} className="fill-current" />
            </span>
            <div className="space-y-1">
              <p className="text-lg font-semibold">{t.home.emptyTitle}</p>
              <p className="max-w-md text-sm text-muted">{t.home.emptyText}</p>
            </div>
            <Link href="/tontines/new" className="btn">
              <Plus size={16} /> {t.home.create}
            </Link>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {tontines.map((x) => {
              const round = x.rounds.find((rd) => rd.number === x.currentRound);
              const paid = round?.contributions.filter((c) => c.status !== "pending").length ?? 0;
              const total = round?.contributions.length ?? x.members.length;
              const cycle = x.status === "COMPLETED" ? 1 : (x.currentRound - 1) / x.totalRounds;
              return (
                <li key={x.id}>
                  <Link href={`/tontines/${x.id}`} className="card group block space-y-4 p-5 transition hover:border-accent/50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-accent">{t.types[x.type as keyof typeof t.types]}</p>
                        <p className="truncate text-lg font-semibold">{x.name}</p>
                      </div>
                      <span className={`badge shrink-0 ${x.status === "ACTIVE" ? "badge-accent" : ""}`}>
                        {x.status === "ACTIVE" ? tf(t.home.roundOf, { n: x.currentRound, total: x.totalRounds }) : t.status[x.status as "DRAWING" | "COMPLETED"]}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-muted">
                        <span>{x.status === "ACTIVE" ? tf(t.home.progress, { paid, total }) : ""}</span>
                        <span>{formatXof(x.amountXof)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#ffb547] to-[#f7931a]"
                          style={{ width: `${Math.round((x.status === "ACTIVE" ? paid / Math.max(total, 1) : cycle) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex -space-x-1.5">
                        {x.members.slice(0, 5).map((m, i) => (
                          <Avatar key={i} name={m.name} size={28} />
                        ))}
                        {x.members.length > 5 && (
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold ring-2 ring-surface">
                            +{x.members.length - 5}
                          </span>
                        )}
                      </span>
                      <ArrowRight size={18} className="text-muted transition group-hover:translate-x-1 group-hover:text-accent" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link href="/marchands" className="card group flex items-center gap-4 p-5 transition hover:border-accent/50">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <Store size={20} />
          </span>
          <span className="flex-1">
            <span className="block font-semibold">{t.merchants.title}</span>
            <span className="text-sm text-muted">{t.home.quickMerchants}</span>
          </span>
          <ArrowRight size={18} className="text-muted transition group-hover:translate-x-1" />
        </Link>
        <Link href="/score" className="card group flex items-center gap-4 p-5 transition hover:border-accent/50">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <FileCheck size={20} />
          </span>
          <span className="flex-1">
            <span className="block font-semibold">{t.certificate.title}</span>
            <span className="text-sm text-muted">{t.home.quickCertificate}</span>
          </span>
          <ArrowRight size={18} className="text-muted transition group-hover:translate-x-1" />
        </Link>
      </section>
    </div>
  );
}
