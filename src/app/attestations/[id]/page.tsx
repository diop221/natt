import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { ActionForm } from "@/components/ActionForm";
import { AutoSync } from "@/components/AutoSync";
import { CertificateView } from "@/components/CertificateView";
import { CopyButton } from "@/components/CopyButton";
import { PrintButton } from "@/components/PrintButton";
import { revokeCertificateAction } from "@/app/score/actions";
import { simulatePayCertificateAction } from "./actions";
import { requireUser } from "@/lib/auth";
import { type CertificatePayload, publicKey, syncCertificate } from "@/lib/certificates";
import { db } from "@/lib/db";
import { getDict, getLocale, tf } from "@/lib/i18n";
import { appUrl } from "@/lib/i18n/notifications";
import { formatXof } from "@/lib/money";
import { isMockProvider } from "@/lib/payments";

export const dynamic = "force-dynamic";

// Le document du titulaire : paiement, puis attestation imprimable avec son QR code de vérification.
export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/attestations/${id}`);
  const found = await db.certificate.findUnique({ where: { id } });
  if (!found || found.userId !== user.id) notFound();
  await syncCertificate(id);
  const cert = await db.certificate.findUniqueOrThrow({ where: { id } });
  const [t, locale] = await Promise.all([getDict(), getLocale()]);

  if (cert.status === "PENDING_PAYMENT") {
    const qr = cert.paymentRequest ? await QRCode.toDataURL(`lightning:${cert.paymentRequest}`, { margin: 1, width: 280 }) : null;
    return (
      <div className="mx-auto max-w-sm space-y-4 text-center">
        <AutoSync active />
        <h1 className="text-2xl font-bold">{t.certificate.title}</h1>
        <p className="text-muted">{tf(t.certificate.pay, { price: formatXof(cert.priceXof) })}</p>
        {qr && (
          <a href={`lightning:${cert.paymentRequest}`} className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code Lightning" className="mx-auto rounded-xl bg-white p-2" />
          </a>
        )}
        {cert.paymentRequest && <CopyButton text={cert.paymentRequest} label={t.pay.copyInvoice} />}
        {isMockProvider() && (
          <ActionForm action={simulatePayCertificateAction}>
            <input type="hidden" name="id" value={cert.id} />
            <button className="text-sm text-warn">{t.common.simulatePay}</button>
          </ActionForm>
        )}
      </div>
    );
  }

  const payload = cert.payload as unknown as CertificatePayload;
  const verifyUrl = appUrl(`/v/${cert.id}`);
  const qr = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 220 });
  const key = publicKey();

  return (
    <article className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="link">Natt</p>
          <h1 className="text-2xl font-bold">{t.certificate.title}</h1>
          {cert.status === "REVOKED" && <p className="font-medium text-danger">{t.certificate.statuses.REVOKED}</p>}
        </div>
        <figure className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt={t.certificate.verifyAt} className="rounded-lg bg-white p-1" width={140} height={140} />
          <figcaption className="mt-1 max-w-[12rem] break-all text-xs text-muted">{verifyUrl}</figcaption>
        </figure>
      </header>

      <CertificateView p={payload} t={t} locale={locale} />

      <p className="text-xs text-muted">
        {tf(t.certificate.signature, { key: cert.keyId ?? "?" })}
        {key.demo && <span className="block text-warn">{t.certificate.demoKey}</span>}
      </p>

      <div className="flex flex-wrap items-center gap-4 print:hidden">
        <PrintButton label={t.certificate.print} />
        {cert.status === "ISSUED" && (
          <ActionForm action={revokeCertificateAction}>
            <input type="hidden" name="id" value={cert.id} />
            <button className="text-sm text-danger" title={t.certificate.revokeHelp}>
              {t.certificate.revoke}
            </button>
          </ActionForm>
        )}
      </div>
    </article>
  );
}
