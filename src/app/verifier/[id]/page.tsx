import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { maskPhone } from "@/lib/audit";
import { db } from "@/lib/db";
import { NETWORKS } from "@/lib/format";
import { getDict, tf } from "@/lib/i18n";
import { isMockProvider } from "@/lib/payments";
import { checkCodeAction, sendCodeAction } from "./actions";

export const dynamic = "force-dynamic";

// Page publique envoyée par WhatsApp : le membre confirme son numéro de versement
// avec le code reçu sur ce même numéro, sans avoir besoin de compte.
export default async function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [t, m] = await Promise.all([getDict(), db.member.findUnique({ where: { id }, include: { tontine: { select: { name: true } } } })]);
  if (!m) notFound();

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">{t.verify.title}</h1>
        <p className="text-muted">{tf(t.verify.intro, { name: m.name, tontine: m.tontine.name })}</p>
        <p className="text-xl font-semibold">
          {NETWORKS[m.network]} · <span className="font-mono">{maskPhone(m.phone)}</span>
        </p>
      </div>

      {m.verifiedAt ? (
        <p className="rounded-xl bg-accent-soft p-6 text-center font-medium text-accent">
          {m.verifiedVia === "OTP" ? t.verify.done : t.verify.doneOrganizer}
        </p>
      ) : (
        <div className="space-y-4 card p-4">
          <p className="text-sm text-muted">{t.verify.why}</p>
          <ActionForm action={sendCodeAction} className="space-y-2">
            <input type="hidden" name="memberId" value={m.id} />
            <button className="btn-ghost w-full">{t.verify.send}</button>
          </ActionForm>
          <ActionForm action={checkCodeAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="memberId" value={m.id} />
            <label className="min-w-0 flex-1 space-y-1">
              <span className="block text-sm">{t.verify.code}</span>
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,7}"
                maxLength={7}
                required
                className="input w-full font-mono tracking-widest"
              />
            </label>
            <button className="btn">{t.verify.check}</button>
          </ActionForm>
          {isMockProvider() && (
            <p className="text-xs text-warn">
              {t.verify.mockHint}{" "}
              <Link href="/dev/messages" className="underline">
                /dev/messages
              </Link>
            </p>
          )}
        </div>
      )}
      <p className="text-center text-xs text-muted">{t.verify.wrongNumber}</p>
    </div>
  );
}
