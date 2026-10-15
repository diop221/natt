import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { createOrg } from "./actions";

export const dynamic = "force-dynamic";

export default async function OrgsPage() {
  const user = await requireUser("/organisations");
  const [t, memberships] = await Promise.all([
    getDict(),
    db.orgMember.findMany({
      where: { userId: user.id },
      include: { org: { include: { _count: { select: { members: true, tontines: true } } } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t.orgs.title}</h1>
        <p className="text-muted">{t.orgs.help}</p>
      </div>
      {memberships.length === 0 ? (
        <p className="text-muted">{t.orgs.none}</p>
      ) : (
        <ul className="divide-y divide-border card">
          {memberships.map(({ org, role }) => (
            <li key={org.id}>
              <Link href={`/organisations/${org.id}`} className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-medium">{org.name}</p>
                  <p className="text-sm text-muted">
                    {org._count.members} {t.common.members} · {org._count.tontines} {t.orgs.caisses.toLowerCase()}
                  </p>
                </div>
                <span className="text-sm text-muted">{t.orgs.role[role as "ADMIN" | "MEMBER"]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <form action={createOrg} className="flex flex-wrap gap-2">
        <input name="name" required maxLength={80} placeholder={t.orgs.name} className="input min-w-0 flex-1" />
        <button className="btn">{t.orgs.create}</button>
      </form>
    </div>
  );
}
