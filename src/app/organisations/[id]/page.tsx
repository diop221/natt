import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { formatXof } from "@/lib/money";
import { tontineTotals } from "@/lib/report";
import { addOrgMember, setOrgRole } from "../actions";

export const dynamic = "force-dynamic";

const card = "card space-y-3 p-5";

export default async function OrgPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/organisations/${id}`);
  const org = await db.organization.findUnique({
    where: { id },
    include: { members: { include: { user: true }, orderBy: { role: "asc" } }, tontines: { select: { id: true } } },
  });
  const me = org?.members.find((m) => m.userId === user.id);
  if (!org || !me) notFound();
  const isAdmin = me.role === "ADMIN";
  const [t, totals] = await Promise.all([getDict(), tontineTotals(org.tontines.map((x) => x.id))]);
  const sum = (k: "collectedXof" | "paidOutXof" | "fundXof") => totals.reduce((s, x) => s + x[k], 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{org.name}</h1>

      <section className={card}>
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">{t.orgs.report}</h2>
          <a href={`/api/organisations/${org.id}/export`} className="link">{t.tontine.export}</a>
        </div>
        <dl className="grid grid-cols-3 gap-3">
          {(
            [
              [t.orgs.collected, sum("collectedXof")],
              [t.orgs.paidOut, sum("paidOutXof")],
              [t.orgs.fund, sum("fundXof")],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-lg bg-background p-3">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="font-semibold">{formatXof(value)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={card}>
        <h2 className="font-semibold">{t.orgs.caisses}</h2>
        {totals.length === 0 ? (
          <p className="text-sm text-muted">{t.orgs.noCaisse}</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {totals.map((x) => (
              <li key={x.id} className="flex flex-wrap justify-between gap-2 py-2">
                <Link href={`/tontines/${x.id}`} className="font-medium text-accent">{x.name}</Link>
                <span className="text-muted">
                  {t.types[x.type as keyof typeof t.types]} · {t.orgs.collected} {formatXof(x.collectedXof)} · {t.orgs.paidOut} {formatXof(x.paidOutXof)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {isAdmin && <Link href="/tontines/new" className="link">{t.home.create}</Link>}
      </section>

      <section className={card}>
        <h2 className="font-semibold">{t.orgs.members}</h2>
        <ul className="divide-y divide-border text-sm">
          {org.members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {m.user.name} <span className="text-muted">· {t.orgs.role[m.role as "ADMIN" | "MEMBER"]}</span>
              </span>
              {isAdmin && (
                <ActionForm action={setOrgRole}>
                  <input type="hidden" name="orgMemberId" value={m.id} />
                  <input type="hidden" name="role" value={m.role === "ADMIN" ? "MEMBER" : "ADMIN"} />
                  <button className="text-sm text-accent">{m.role === "ADMIN" ? t.orgs.makeMember : t.orgs.makeAdmin}</button>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
        {isAdmin && (
          <ActionForm action={addOrgMember} className="flex flex-wrap gap-2">
            <input type="hidden" name="orgId" value={org.id} />
            <input name="phone" type="tel" required placeholder={t.orgs.addMember} className="input min-w-0 flex-1" />
            <button className="btn">{t.orgs.add}</button>
          </ActionForm>
        )}
      </section>
    </div>
  );
}
