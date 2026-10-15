import { createHash, createPrivateKey, createPublicKey, randomBytes, sign, verify } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { maskPhone } from "@/lib/audit";
import { db } from "@/lib/db";
import { xofToSats } from "@/lib/money";
import { getProvider } from "@/lib/payments";
import { reliability } from "@/lib/score";
import { NattError } from "@/lib/tontine";

// Attestation de régularité des cotisations : un document daté, figé et signé (Ed25519).
// Elle distingue les cotisations enregistrées, les sommes réellement payées, les cagnottes reçues
// et ce qui reste dû. Ce n'est ni une preuve de revenus ni une garantie de solvabilité.
//
// Clé : ATTESTATION_SIGNING_KEY = 32 octets aléatoires en base64 (openssl rand -base64 32).
// En mode simulé, sans clé, une clé de démonstration publique est utilisée et signalée comme telle.

export const DISCLAIMER =
  "Ce document récapitule les cotisations enregistrées sur Natt à la date d'émission. Il ne constitue ni une preuve officielle de revenus, ni une garantie de solvabilité, ni un justificatif accepté d'office pour un crédit, une location ou un visa : son acceptation dépend de l'organisme qui le reçoit.";

const VALIDITY_DAYS = 90;
export const certificatePrice = () => Number(process.env.ATTESTATION_PRICE_XOF ?? 2_500);

// ─── Clé de signature ──────────────────────────────────────────────────────

const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const DEV_SEED = createHash("sha256").update("natt-cle-de-demonstration-attestations").digest();

function signingKey() {
  const raw = process.env.ATTESTATION_SIGNING_KEY;
  if (!raw && process.env.PAYMENT_PROVIDER === "bitnob") throw new Error("ATTESTATION_SIGNING_KEY est requise pour émettre des attestations.");
  const seed = raw ? Buffer.from(raw, "base64") : DEV_SEED;
  if (seed.length !== 32) throw new Error("ATTESTATION_SIGNING_KEY doit faire 32 octets (base64).");
  return { key: createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: "der", type: "pkcs8" }), demo: !raw };
}

// Clé publique (32 octets, base64) et son empreinte, publiées sur le portail de vérification.
export function publicKey() {
  const { key, demo } = signingKey();
  const raw = createPublicKey(key).export({ format: "der", type: "spki" }).subarray(-32);
  return { base64: raw.toString("base64"), keyId: createHash("sha256").update(raw).digest("hex").slice(0, 16), demo };
}

// JSON canonique (clés triées) : c'est exactement cette chaîne qui est signée.
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function verifySignature(payload: unknown, signature: string, publicKeyBase64: string) {
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKeyBase64, "base64")]);
  const key = createPublicKey({ key: spki, format: "der", type: "spki" });
  return verify(null, Buffer.from(canonical(payload)), key, Buffer.from(signature, "base64url"));
}

// ─── Contenu ───────────────────────────────────────────────────────────────

type Line = {
  recordedCount: number; // cotisations échues (ou payées)
  recordedXof: number;
  paidXof: number; // réellement payé par le membre (y compris remboursements des avances)
  onTime: number;
  late: number;
  covered: number; // avancées par le fonds de garantie
  missed: number; // échues et toujours impayées
  potsReceivedXof: number; // cagnottes et restitutions reçues sur son compte
  purchasesXof: number; // achats Natt Marchands réglés pour lui
  outstandingXof: number; // reste dû : cotisations échues impayées, pénalités, avances non remboursées
};
const emptyLine = (): Line => ({ recordedCount: 0, recordedXof: 0, paidXof: 0, onTime: 0, late: 0, covered: 0, missed: 0, potsReceivedXof: 0, purchasesXof: 0, outstandingXof: 0 });

export type CertificatePayload = {
  v: 1;
  number: string;
  issuedAt: string;
  expiresAt: string;
  holder: { name: string; phone: string; identity: "PHONE_VERIFIED" | "DECLARED" };
  period: { from: string; to: string } | null;
  score: number | null;
  totals: Line;
  tontines: (Line & { name: string; type: string; status: string; from: string | null; to: string | null })[];
  disclaimer: string;
};

export async function buildPayload(userId: string, number: string, issuedAt: Date, expiresAt: Date): Promise<CertificatePayload> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const places = await db.member.findMany({
    where: { userId },
    include: {
      tontine: true,
      contributions: { include: { round: true } },
      charges: true,
      payouts: { where: { status: "PAID" } },
      orders: { where: { status: { not: "PAYING" } } },
    },
    orderBy: { tontine: { createdAt: "asc" } },
  });
  const totals = emptyLine();
  const dates: Date[] = [];
  const tontines = places.map((m) => {
    const line = emptyLine();
    const due = m.contributions.filter((c) => c.status !== "pending" || c.round.dueAt < issuedAt);
    for (const c of due) {
      const payable = c.amountXof - c.creditUsedXof + c.guaranteeXof;
      line.recordedCount++;
      line.recordedXof += c.amountXof;
      if (c.status === "paid") {
        line.paidXof += payable;
        if (c.paidAt && c.paidAt <= c.round.dueAt) line.onTime++;
        else line.late++;
      } else if (c.status === "covered") {
        line.covered++;
      } else {
        line.missed++;
        line.outstandingXof += payable;
      }
    }
    for (const ch of m.charges) {
      if (ch.status === "paid") line.paidXof += ch.amountXof; // pénalités et remboursements d'avances
      if (ch.status === "pending") line.outstandingXof += ch.amountXof;
    }
    line.potsReceivedXof = m.payouts.filter((p) => !p.merchantId).reduce((s, p) => s + p.amountXof, 0);
    line.purchasesXof = m.orders.reduce((s, o) => s + o.priceXof, 0);
    const span = due.map((c) => c.round.dueAt).sort((a, b) => a.getTime() - b.getTime());
    dates.push(...span);
    for (const k of Object.keys(totals) as (keyof Line)[]) totals[k] += line[k];
    return {
      name: m.tontine.name,
      type: m.tontine.type,
      status: m.tontine.status,
      from: span[0]?.toISOString().slice(0, 10) ?? null,
      to: span.at(-1)?.toISOString().slice(0, 10) ?? null,
      ...line,
    };
  });
  dates.sort((a, b) => a.getTime() - b.getTime());
  const proven = await db.member.count({ where: { phone: user.phone, verifiedVia: "OTP" } });
  return {
    v: 1,
    number,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    holder: { name: user.name, phone: maskPhone(user.phone), identity: proven > 0 ? "PHONE_VERIFIED" : "DECLARED" },
    period: dates.length ? { from: dates[0].toISOString().slice(0, 10), to: dates.at(-1)!.toISOString().slice(0, 10) } : null,
    score: (await reliability(userId, issuedAt)).score,
    totals,
    tontines,
    disclaimer: DISCLAIMER,
  };
}

// ─── Cycle de vie ──────────────────────────────────────────────────────────

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // sans 0/O ni 1/I/L, pour la saisie
const newNumber = (year: number) => `NATT-${year}-${Array.from(randomBytes(7), (b) => ALPHABET[b % ALPHABET.length]).join("")}`;

// Demande : facture Lightning du prix de l'attestation (ou émission directe si elle est gratuite).
export async function requestCertificate(userId: string, now = new Date()) {
  const places = await db.member.count({ where: { userId } });
  if (places === 0) throw new NattError("Aucune tontine à attester pour l'instant.");
  if (await db.certificate.findFirst({ where: { userId, status: "PENDING_PAYMENT" } })) {
    throw new NattError("Une attestation attend déjà son paiement.");
  }
  const priceXof = certificatePrice();
  const id = randomBytes(18).toString("base64url");
  const invoice = priceXof > 0
    ? await getProvider().createInvoice({ sats: await xofToSats(priceXof), description: "Natt · attestation de régularité", reference: `natt-cert-${id}` })
    : null;
  const cert = await db.certificate.create({
    data: {
      id,
      number: newNumber(now.getFullYear()),
      userId,
      priceXof,
      invoiceId: invoice?.id,
      paymentRequest: invoice?.paymentRequest,
      expiresAt: new Date(now.getTime() + VALIDITY_DAYS * 24 * 3600 * 1000),
    },
  });
  if (!invoice) await issue(cert.id, now);
  return cert;
}

// Vérifie le paiement et émet l'attestation : le contenu est calculé et signé à ce moment-là.
export async function syncCertificate(id: string, now = new Date()) {
  const cert = await db.certificate.findUniqueOrThrow({ where: { id } });
  if (cert.status !== "PENDING_PAYMENT" || !cert.invoiceId) return;
  if ((await getProvider().getInvoiceStatus(cert.invoiceId)) === "paid") await issue(id, now);
}

async function issue(id: string, now: Date) {
  const cert = await db.certificate.findUniqueOrThrow({ where: { id } });
  const expiresAt = new Date(now.getTime() + VALIDITY_DAYS * 24 * 3600 * 1000);
  const payload = await buildPayload(cert.userId, cert.number, now, expiresAt);
  const { key } = signingKey();
  const signature = sign(null, Buffer.from(canonical(payload)), key).toString("base64url");
  await db.certificate.updateMany({
    where: { id, status: "PENDING_PAYMENT" },
    data: { status: "ISSUED", payload: payload as unknown as Prisma.InputJsonValue, signature, keyId: publicKey().keyId, issuedAt: now, expiresAt },
  });
}

export async function revokeCertificate(id: string, userId: string) {
  const { count } = await db.certificate.updateMany({ where: { id, userId, status: "ISSUED" }, data: { status: "REVOKED", revokedAt: new Date() } });
  if (count === 0) throw new NattError("Attestation introuvable ou déjà révoquée.");
}

// Résultat affiché par le portail de vérification.
export async function checkCertificate(id: string, now = new Date()) {
  const cert = await db.certificate.findUnique({ where: { id } });
  if (!cert || cert.status === "PENDING_PAYMENT" || !cert.payload || !cert.signature) return { state: "UNKNOWN" as const };
  const key = publicKey();
  const signatureOk = cert.keyId === key.keyId && verifySignature(cert.payload, cert.signature, key.base64);
  const payload = cert.payload as unknown as CertificatePayload;
  const state = !signatureOk ? "INVALID" : cert.status === "REVOKED" ? "REVOKED" : cert.expiresAt < now ? "EXPIRED" : "VALID";
  return { state, payload, cert, key } as const;
}

// Saisie manuelle : le numéro seul ne suffit pas (il serait trop facile d'en essayer au hasard),
// il faut aussi le nom du titulaire tel qu'il figure sur le document.
export async function findByNumber(number: string, holderName: string) {
  const cert = await db.certificate.findUnique({ where: { number: number.trim().toUpperCase() } });
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
  const printed = (cert?.payload as CertificatePayload | null)?.holder.name;
  if (!cert || !printed || norm(printed) !== norm(holderName)) return null;
  return cert.id;
}
