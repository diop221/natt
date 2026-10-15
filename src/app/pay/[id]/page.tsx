import { notFound } from "next/navigation";
import { Check, Wallet, Zap } from "lucide-react";
import QRCode from "qrcode";
import { AutoSync } from "@/components/AutoSync";
import { CopyButton } from "@/components/CopyButton";
import { SyncError } from "@/components/SyncError";
import { db } from "@/lib/db";
import { getDict, tf } from "@/lib/i18n";
import { formatXof } from "@/lib/money";
import { syncTontine } from "@/lib/tontine";
import { setSponsorName } from "./actions";

export const dynamic = "force-dynamic";

// Page publique envoyée à un membre (par WhatsApp) pour payer une cotisation, une pénalité
// ou un remboursement, sans avoir besoin de compte.
export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getDict();
  const ref =
    (await db.contribution.findUnique({ where: { id }, select: { round: { select: { tontineId: true } } } }))?.round.tontineId ??
    (await db.charge.findUnique({ where: { id }, select: { tontineId: true } }))?.tontineId;
  if (!ref) notFound();
  const syncError = await syncTontine(ref).then(() => null, () => t.pay.checkLater);

  const c = await db.contribution.findUnique({
    where: { id },
    include: { member: true, round: { include: { tontine: true, beneficiary: true, hand: { include: { holders: { include: { member: true } } } } } } },
  });
  const ch = c ? null : await db.charge.findUnique({ where: { id }, include: { member: true, tontine: true } });

  let title: string, subtitle: string, amount: number, sats: number, status: string, paymentRequest: string | null, note: string | null = null;
  if (c) {
    title = tf(t.pay.contributionOf, { name: c.member.name });
    subtitle = `${c.round.tontine.name} · ${t.common.round} ${c.round.number}`;
    amount = c.amountXof - c.creditUsedXof + c.guaranteeXof;
    sats = c.sats;
    status = c.status;
    paymentRequest = c.paymentRequest;
    const receivers = c.round.hand ? c.round.hand.holders.map((h) => h.member.name) : c.round.beneficiary ? [c.round.beneficiary.name] : [];
    if (receivers.length) note = tf(t.pay.goesTo, { name: receivers.join(" + ") });
    if (c.status === "covered") {
      const repayment = await db.charge.findUnique({
        where: { roundId_memberId_kind: { roundId: c.roundId, memberId: c.memberId, kind: "REPAYMENT" } },
      });
      if (repayment?.status === "paid") status = "paid";
      else note = t.pay.covered;
    }
  } else if (ch) {
    title = tf(ch.kind === "PENALTY" ? t.pay.penaltyOf : t.pay.repaymentOf, { name: ch.member.name });
    subtitle = ch.tontine.name;
    amount = ch.amountXof;
    sats = ch.sats;
    status = ch.status;
    paymentRequest = ch.paymentRequest;
  } else notFound();

  // Une cotisation avancée par le fonds se rembourse avec la même facture.
  const payable = status === "pending" || status === "covered";
  const qr = payable && paymentRequest ? await QRCode.toDataURL(`lightning:${paymentRequest}`, { margin: 1, width: 320, errorCorrectionLevel: "H" }) : null;

  return (
    <div className="mx-auto max-w-md space-y-5">
      <AutoSync active={payable} />
      <SyncError message={syncError} />

      <div className="card relative overflow-hidden p-6 text-center">
        <div className="glow pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2" />
        <div className="relative space-y-1">
          <span className="badge badge-accent">
            <Zap size={11} className="fill-current" /> Lightning
          </span>
          <p className="pt-2 text-sm text-muted">{subtitle}</p>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="pt-2 text-4xl font-extrabold tracking-tight">{formatXof(amount)}</p>
          {sats > 0 && <p className="font-mono text-sm text-accent">≈ {sats.toLocaleString("fr-FR")} sats</p>}
          {note && <p className="pt-2 text-sm text-muted">{note}</p>}
        </div>
      </div>

      {!payable || !qr ? (
        <div className="card flex flex-col items-center gap-3 border-success/40 bg-success-soft p-8 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-success text-black">
            <Check size={28} strokeWidth={3} />
          </span>
          <p className="text-lg font-semibold text-success">{t.pay.received}</p>
        </div>
      ) : (
        <>
          <div className="card space-y-4 p-6 text-center">
            <a href={`lightning:${paymentRequest}`} className="relative mx-auto block w-fit rounded-3xl bg-gradient-to-br from-[#ffc56b] via-[#f7931a] to-[#e46a00] p-1.5 shadow-[0_20px_50px_-20px_rgba(247,147,26,0.8)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR code Lightning" className="rounded-[1.2rem] bg-white p-3" width={280} height={280} />
              <span className="absolute top-1/2 left-1/2 inline-flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-[#f7931a] ring-4 ring-white">
                <Zap size={24} className="fill-black text-black" />
              </span>
            </a>
            <p className="inline-flex items-center gap-2 text-sm text-muted">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> {t.pay.waiting}
            </p>
            <a href={`lightning:${paymentRequest}`} className="btn btn-lg w-full">
              <Wallet size={18} /> {t.pay.openWallet}
            </a>
            <div className="flex items-center gap-2 rounded-xl bg-surface-2 p-2 pl-3 text-left">
              <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted">{paymentRequest}</p>
              <CopyButton text={paymentRequest!} label={t.pay.copyInvoice} />
            </div>
            <p className="text-xs text-muted">{t.pay.lightningNote}</p>
            <div className="space-y-2 pt-1">
              <p className="text-xs font-semibold text-muted uppercase">{t.pay.wallets}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {["Wallet of Satoshi", "Phoenix", "Blink", "Breez", "Strike"].map((w) => (
                  <span key={w} className="badge">{w}</span>
                ))}
              </div>
            </div>
          </div>

          {c && c.status === "pending" && (
            <div className="card space-y-2 p-4">
              {c.sponsorName ? (
                <p className="text-sm text-success">{tf(t.pay.sponsorSaved, { name: c.sponsorName })}</p>
              ) : (
                <form action={setSponsorName} className="space-y-2">
                  <p className="text-sm font-medium">{tf(t.pay.sponsorTitle, { name: c.member.name })}</p>
                  <p className="text-xs text-muted">{t.pay.noWallet}</p>
                  <input type="hidden" name="id" value={c.id} />
                  <div className="flex gap-2">
                    <input name="sponsorName" maxLength={60} placeholder={t.pay.sponsorName} required className="input min-w-0 flex-1" />
                    <button className="btn-ghost">{t.pay.sponsorSave}</button>
                  </div>
                </form>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
