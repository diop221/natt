import { notFound } from "next/navigation";
import { ScoreCard } from "@/components/ScoreCard";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getDict, getLocale, tf } from "@/lib/i18n";
import { reliability } from "@/lib/score";

export const dynamic = "force-dynamic";

// Page publique : nom, score et historique, mais ni numéro ni détail des tontines.
export default async function AttestationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const a = await db.attestation.findUnique({ where: { id: token }, include: { user: true } });
  if (!a) notFound();
  const [t, locale] = await Promise.all([getDict(), getLocale()]);
  if (a.expiresAt < new Date()) return <p className="text-center text-muted">{t.attestation.expired}</p>;
  const r = await reliability(a.userId);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-bold">{t.attestation.title}</h1>
      <p>{tf(t.attestation.intro, { name: a.user.name })}</p>
      <ScoreCard r={r} t={t} />
      <p className="text-sm text-muted">
        {tf(t.attestation.issued, { date: formatDate(a.createdAt, locale), expires: formatDate(a.expiresAt, locale) })}
      </p>
    </div>
  );
}
