import Link from "next/link";
import { CertificateView } from "@/components/CertificateView";
import { canonical, checkCertificate } from "@/lib/certificates";
import { getDict, getLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const STYLES = {
  VALID: "bg-accent-soft text-accent",
  EXPIRED: "bg-warn-soft text-warn",
  REVOKED: "bg-warn-soft text-danger",
  INVALID: "bg-warn-soft text-danger",
  UNKNOWN: "bg-border text-muted",
} as const;

// Résultat de vérification (adresse du QR code). Affiche uniquement le contenu signé de l'attestation :
// ni numéro complet, ni autres membres, ni détail des paiements.
export default async function VerifyResult({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [t, locale, result] = await Promise.all([getDict(), getLocale(), checkCertificate(token)]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/v" className="text-sm text-accent">
          ← {t.verifyPortal.title}
        </Link>
        <p className={`rounded-xl p-4 text-lg font-semibold ${STYLES[result.state]}`}>{t.verifyPortal.states[result.state]}</p>
      </div>
      {result.state !== "UNKNOWN" && (
        <>
          <p className="text-sm text-muted">{t.verifyPortal.compare}</p>
          <CertificateView p={result.payload} t={t} locale={locale} />
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">{t.verifyPortal.technical}</summary>
            <div className="mt-2 space-y-2 break-all font-mono">
              <p>
                {t.verifyPortal.publicKey} ({result.key.keyId}) : {result.key.base64}
                {result.key.demo && <span className="block text-warn">{t.certificate.demoKey}</span>}
              </p>
              <p>signature (Ed25519, base64url) : {result.cert.signature}</p>
              <p>message signé (JSON canonique) : {canonical(result.payload)}</p>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
