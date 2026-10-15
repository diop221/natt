import { createHmac, timingSafeEqual } from "node:crypto";
import { syncCertificate } from "@/lib/certificates";
import { db } from "@/lib/db";
import { checkProcessingPayouts, syncTontine } from "@/lib/tontine";

// Webhooks Bitnob (URL à déclarer dans le tableau de bord Bitnob : <APP_URL>/api/webhooks/bitnob).
// Signature : HMAC SHA512 du corps avec BITNOB_WEBHOOK_SECRET, dans l'en-tête x-bitnob-signature.
// Le webhook ne fait qu'accélérer : chaque événement déclenche une relecture auprès de l'API
// (facture ou payout), on ne crédite jamais sur la seule foi du payload. Bitnob relance jusqu'à
// 3 fois sans réponse 200 ; tout le traitement est idempotent.

function validSignature(raw: string, header: string | null, secret: string) {
  if (!header) return false;
  const candidates = [raw];
  // Bitnob signe JSON.stringify(corps) : si le corps reçu n'est pas compact, on compare aussi cette forme.
  try {
    candidates.push(JSON.stringify(JSON.parse(raw)));
  } catch {}
  const given = Buffer.from(header, "hex");
  return candidates.some((body) => {
    const expected = createHmac("sha512", secret).update(body).digest();
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export async function POST(req: Request) {
  const secret = process.env.BITNOB_WEBHOOK_SECRET;
  if (!secret) return new Response("BITNOB_WEBHOOK_SECRET manquant", { status: 500 });
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-bitnob-signature"), secret)) return new Response("Signature invalide", { status: 401 });

  const { event, data } = JSON.parse(raw) as { event?: string; data?: Record<string, string> };
  try {
    if (event === "transfer.success" || event === "btc.lightning.received.success") {
      // Paiement Lightning reçu : on retrouve la facture (cotisation, pénalité ou attestation) et on resynchronise.
      const request = data?.invoice ?? data?.request ?? data?.payment_request;
      if (request) {
        const [contribution, charge, certificate] = await Promise.all([
          db.contribution.findFirst({ where: { paymentRequest: request }, select: { round: { select: { tontineId: true } } } }),
          db.charge.findFirst({ where: { paymentRequest: request }, select: { tontineId: true } }),
          db.certificate.findFirst({ where: { paymentRequest: request }, select: { id: true } }),
        ]);
        const tontineId = contribution?.round.tontineId ?? charge?.tontineId;
        if (tontineId) await syncTontine(tontineId);
        if (certificate) await syncCertificate(certificate.id);
      }
    } else if (event?.startsWith("payouts.") && data?.id) {
      // Suivi d'un versement mobile money : on relit son statut chez Bitnob.
      await checkProcessingPayouts({ providerId: data.id });
    }
  } catch (err) {
    // Réponse non 200 : Bitnob relancera l'événement.
    return new Response(`Erreur : ${err instanceof Error ? err.message : err}`, { status: 500 });
  }
  return new Response("ok");
}
