import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { audit, maskPhone } from "@/lib/audit";
import { db } from "@/lib/db";
import { NETWORKS } from "@/lib/format";
import { appUrl, msg } from "@/lib/i18n/notifications";
import { notify } from "@/lib/notify";
import { NattError, retryHeldPayouts } from "@/lib/tontine";

// Vérification du numéro qui reçoit les versements d'un membre.
// Un numéro saisi par l'organisateur n'est jamais considéré comme vérifié : il faut soit
// le code reçu sur ce numéro (OTP), soit une confirmation explicite et journalisée de
// l'organisateur quand le membre ne peut pas recevoir le code.

const OTP_TTL_MS = 15 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_PER_DAY = 5;

const codeHash = (otpId: string, code: string) => createHash("sha256").update(`${otpId}:${code}`).digest("hex");

export const isVerified = (m: { verifiedAt: Date | null }) => m.verifiedAt !== null;

// Lien envoyé au membre pour qu'il confirme son numéro (au plus un par heure).
export async function inviteVerification(memberId: string, actorId?: string | null) {
  const m = await db.member.findUniqueOrThrow({ where: { id: memberId }, include: { tontine: true, user: true } });
  if (isVerified(m)) throw new NattError(`Le numéro de ${m.name} est déjà vérifié.`);
  const hour = new Date().toISOString().slice(0, 13);
  await notify(
    m.phone,
    msg(m.user?.locale, "verifyInvite", {
      tontine: m.tontine.name,
      network: NETWORKS[m.network] ?? m.network,
      phone: m.phone,
      link: appUrl(`/verifier/${m.id}`),
    }),
    `verify-invite:${m.id}:${hour}`,
  );
  await audit({ tontineId: m.tontineId, memberId: m.id, actorId, action: "VERIFY_INVITE", label: `Lien de vérification envoyé à ${m.name}` });
}

// À la création d'une tontine qui exige des numéros vérifiés : un lien à chaque membre pas encore vérifié.
export async function inviteAll(tontineId: string, actorId?: string | null) {
  const members = await db.member.findMany({ where: { tontineId, verifiedAt: null } });
  for (const m of members) await inviteVerification(m.id, actorId);
}

export async function sendVerificationCode(memberId: string, now = new Date()) {
  const m = await db.member.findUniqueOrThrow({ where: { id: memberId }, include: { user: true } });
  if (isVerified(m)) throw new NattError("Ce numéro est déjà vérifié.");
  const recent = await db.phoneOtp.findMany({
    where: { memberId, createdAt: { gt: new Date(now.getTime() - 24 * 3600 * 1000) } },
    orderBy: { createdAt: "desc" },
  });
  if (recent[0] && now.getTime() - recent[0].createdAt.getTime() < OTP_COOLDOWN_MS) {
    throw new NattError("Un code vient d'être envoyé. Patientez une minute avant d'en demander un autre.");
  }
  if (recent.length >= OTP_MAX_PER_DAY) throw new NattError("Trop de codes demandés aujourd'hui. Réessayez demain.");

  const id = randomUUID();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.phoneOtp.create({
    data: { id, memberId, codeHash: codeHash(id, code), expiresAt: new Date(now.getTime() + OTP_TTL_MS), createdAt: now },
  });
  await notify(m.phone, msg(m.user?.locale, "otp", { code }));
  await audit({ tontineId: m.tontineId, memberId, action: "OTP_SENT", label: `Code envoyé sur ${maskPhone(m.phone)}` });
}

export async function checkVerificationCode(memberId: string, code: string, now = new Date()) {
  const m = await db.member.findUniqueOrThrow({ where: { id: memberId } });
  if (isVerified(m)) return;
  const otp = await db.phoneOtp.findFirst({ where: { memberId, usedAt: null }, orderBy: { createdAt: "desc" } });
  if (!otp || otp.expiresAt <= now) throw new NattError("Code expiré ou inexistant : demandez un nouveau code.");
  if (otp.attempts >= OTP_MAX_ATTEMPTS) throw new NattError("Trop d'essais : demandez un nouveau code.");

  const given = Buffer.from(codeHash(otp.id, code.trim()), "hex");
  if (!timingSafeEqual(given, Buffer.from(otp.codeHash, "hex"))) {
    // L'essai est compté avant de répondre, pour qu'on ne puisse pas en faire plus que prévu en parallèle.
    const { count } = await db.phoneOtp.updateMany({
      where: { id: otp.id, attempts: { lt: OTP_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    await audit({ tontineId: m.tontineId, memberId, action: "OTP_FAILED", label: `Code erroné saisi pour ${m.name}` });
    throw new NattError(count === 0 ? "Trop d'essais : demandez un nouveau code." : "Code incorrect.");
  }
  const { count } = await db.phoneOtp.updateMany({ where: { id: otp.id, usedAt: null }, data: { usedAt: now } });
  if (count === 0) return; // déjà utilisé par une requête simultanée

  // Le code prouve qu'on détient ce numéro : toutes les places du même numéro et du même réseau
  // (dans les autres tontines aussi) passent en vérifié.
  const places = await db.member.findMany({
    where: { phone: m.phone, network: m.network, OR: [{ verifiedAt: null }, { verifiedVia: { not: "OTP" } }] },
  });
  await db.member.updateMany({ where: { id: { in: places.map((p) => p.id) } }, data: { verifiedAt: now, verifiedVia: "OTP" } });
  for (const p of places) {
    await audit({ tontineId: p.tontineId, memberId: p.id, action: "VERIFIED", label: `Numéro de ${p.name} vérifié par code (${maskPhone(p.phone)})` });
  }
  await retryHeldPayouts(places.map((p) => p.id));
}

// Quand le membre ne peut pas recevoir le code : l'organisateur atteste avoir vérifié le numéro
// avec lui. Il ne peut pas le faire pour sa propre place.
export async function confirmByOrganizer(memberId: string, actorId: string, actorName: string) {
  const m = await db.member.findUniqueOrThrow({ where: { id: memberId } });
  if (isVerified(m)) throw new NattError(`Le numéro de ${m.name} est déjà vérifié.`);
  if (m.userId === actorId) throw new NattError("Vérifiez votre propre numéro avec le code reçu sur WhatsApp.");
  const { count } = await db.member.updateMany({
    where: { id: memberId, verifiedAt: null },
    data: { verifiedAt: new Date(), verifiedVia: "ORGANIZER" },
  });
  if (count === 0) return;
  await audit({
    tontineId: m.tontineId,
    memberId,
    actorId,
    action: "CONFIRMED",
    label: `${actorName} confirme avoir vérifié le numéro de ${m.name} (${maskPhone(m.phone)})`,
  });
  await retryHeldPayouts([memberId]);
}

// Correction du numéro ou du réseau d'un membre par l'organisateur. La vérification repart de zéro,
// et la place est reliée au compte qui a ce nouveau numéro.
export async function updatePaymentDetails(memberId: string, input: { phone: string; network: string }, actorId: string) {
  const m = await db.member.findUniqueOrThrow({ where: { id: memberId }, include: { tontine: true } });
  if (m.phone === input.phone && m.network === input.network) return;
  if (await db.member.findFirst({ where: { tontineId: m.tontineId, phone: input.phone, id: { not: m.id } } })) {
    throw new NattError("Un autre membre de la tontine a déjà ce numéro.");
  }
  if (await db.payout.findFirst({ where: { memberId, status: { in: ["SENDING", "PROCESSING"] } } })) {
    throw new NattError("Un versement vers ce membre est en cours : réessayez dans un instant.");
  }
  const user = await db.user.findUnique({ where: { phone: input.phone }, select: { id: true } });
  await db.member.update({
    where: { id: memberId },
    data: { phone: input.phone, network: input.network, userId: user?.id ?? null, verifiedAt: null, verifiedVia: null },
  });
  await db.phoneOtp.updateMany({ where: { memberId, usedAt: null }, data: { expiresAt: new Date() } });
  await audit({
    tontineId: m.tontineId,
    memberId,
    actorId,
    action: "PHONE_CHANGED",
    label: `Numéro de ${m.name} modifié : ${NETWORKS[m.network]} ${maskPhone(m.phone)} → ${NETWORKS[input.network]} ${maskPhone(input.phone)}`,
  });
  if (m.tontine.verifyPayouts) await inviteVerification(memberId, actorId);
}
