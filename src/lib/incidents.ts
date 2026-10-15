import { audit, maskPhone } from "@/lib/audit";
import { db } from "@/lib/db";
import { NETWORKS } from "@/lib/format";
import { appUrl, msg } from "@/lib/i18n/notifications";
import { notify } from "@/lib/notify";
import { NattError, retryHeldPayouts } from "@/lib/tontine";
import { inviteVerification } from "@/lib/verification";

// Situations exceptionnelles (hospitalisation, incapacité, décès…) et ayants droit.
//   - chaque membre peut désigner un contact d'urgence et un ayant droit (facultatif) ;
//   - n'importe quel participant peut signaler une situation ; l'organisateur (ou le bureau) la traite :
//     suspension, justificatif constaté, puis décision (reprise, transfert de la place, autre) ;
//   - le transfert à un ayant droit n'est jamais automatique : justificatif constaté, décision
//     journalisée, et versements bloqués tant que le numéro de l'ayant droit n'est pas vérifié par code.

export const INCIDENT_KINDS = ["HOSPITAL", "INCAPACITY", "DEATH", "OTHER"] as const;
const KIND_LABELS: Record<string, string> = { HOSPITAL: "hospitalisation", INCAPACITY: "incapacité", DEATH: "décès", OTHER: "autre" };

export type Contacts = {
  emergencyName: string | null;
  emergencyPhone: string | null;
  heirName: string | null;
  heirPhone: string | null;
  heirRelation: string | null;
};

// Le membre lui-même renseigne ses contacts (numéros déjà normalisés).
export async function setContacts(memberId: string, contacts: Contacts, actorId: string) {
  const m = await db.member.update({ where: { id: memberId }, data: { ...contacts, contactsAt: new Date() } });
  await audit({ tontineId: m.tontineId, memberId, actorId, action: "CONTACTS_UPDATED", label: `${m.name} met à jour son contact d'urgence et son ayant droit` });
}

export async function reportIncident(memberId: string, input: { kind: string; description: string }, reporter: { id: string; name: string }) {
  if (!INCIDENT_KINDS.includes(input.kind as (typeof INCIDENT_KINDS)[number])) throw new NattError("Choisissez le type de situation.");
  const m = await db.member.findUniqueOrThrow({ where: { id: memberId }, include: { tontine: { include: { owner: true } } } });
  if (await db.incident.findFirst({ where: { memberId, status: "OPEN" } })) {
    throw new NattError(`Une situation est déjà en cours de traitement pour ${m.name}.`);
  }
  const incident = await db.incident.create({
    data: { tontineId: m.tontineId, memberId, kind: input.kind, description: input.description, reportedById: reporter.id },
  });
  await audit({
    tontineId: m.tontineId,
    memberId,
    actorId: reporter.id,
    action: "INCIDENT_REPORTED",
    label: `${reporter.name} signale une situation exceptionnelle pour ${m.name} (${KIND_LABELS[input.kind]})`,
  });
  await notify(
    m.tontine.owner.phone,
    msg(m.tontine.owner.locale, "incidentReported", {
      tontine: m.tontine.name,
      member: m.name,
      kind: KIND_LABELS[input.kind],
      link: appUrl(`/tontines/${m.tontineId}`),
    }),
    `incident:${incident.id}`,
  );
  return incident;
}

async function openIncident(incidentId: string) {
  const incident = await db.incident.findUniqueOrThrow({ where: { id: incidentId }, include: { member: true } });
  if (incident.status !== "OPEN") throw new NattError("Ce dossier est déjà clos.");
  return incident;
}

// Suspension temporaire : plus de rappels ni de pénalités, versements au membre retenus.
export async function suspendMember(incidentId: string, actor: { id: string; name: string }) {
  const { member: m, tontineId } = await openIncident(incidentId);
  const { count } = await db.member.updateMany({ where: { id: m.id, suspendedAt: null }, data: { suspendedAt: new Date() } });
  if (count === 0) throw new NattError(`${m.name} est déjà suspendu.`);
  await audit({ tontineId, memberId: m.id, actorId: actor.id, action: "MEMBER_SUSPENDED", label: `${actor.name} suspend rappels, pénalités et versements de ${m.name}` });
}

// L'organisateur indique le justificatif qu'il a vu (nature, date, référence). Natt ne stocke pas le document.
export async function recordEvidence(incidentId: string, evidence: string, actor: { id: string; name: string }) {
  const incident = await openIncident(incidentId);
  if (!evidence.trim()) throw new NattError("Décrivez le justificatif constaté.");
  await db.incident.update({ where: { id: incidentId }, data: { evidence: evidence.trim(), evidenceAt: new Date() } });
  await audit({
    tontineId: incident.tontineId,
    memberId: incident.memberId,
    actorId: actor.id,
    action: "EVIDENCE_RECORDED",
    label: `${actor.name} a constaté un justificatif pour ${incident.member.name} : ${evidence.trim()}`,
  });
}

type Decision =
  | { decision: "RESUME"; note?: string }
  | { decision: "OTHER"; note: string }
  | { decision: "TRANSFER"; note?: string; heir: { name: string; phone: string; network: string } };

export async function decideIncident(incidentId: string, d: Decision, actor: { id: string; name: string }) {
  const incident = await openIncident(incidentId);
  const m = incident.member;
  if (d.decision === "OTHER" && !d.note?.trim()) throw new NattError("Précisez la décision prise.");

  if (d.decision === "TRANSFER") {
    if (!incident.evidence) throw new NattError("Un justificatif doit être constaté avant de transférer la place.");
    const { heir } = d;
    if (await db.member.findFirst({ where: { tontineId: m.tontineId, phone: heir.phone, id: { not: m.id } } })) {
      throw new NattError("Ce numéro est déjà celui d'un autre membre de la tontine.");
    }
    if (await db.payout.findFirst({ where: { memberId: m.id, status: { in: ["SENDING", "PROCESSING"] } } })) {
      throw new NattError("Un versement vers ce membre est en cours : réessayez dans un instant.");
    }
    const user = await db.user.findUnique({ where: { phone: heir.phone }, select: { id: true } });
    await db.member.update({
      where: { id: m.id },
      data: {
        name: heir.name,
        phone: heir.phone,
        network: heir.network,
        userId: user?.id ?? null,
        verifiedAt: null,
        verifiedVia: null,
        transferredAt: new Date(),
        suspendedAt: null,
        emergencyName: null,
        emergencyPhone: null,
        heirName: null,
        heirPhone: null,
        heirRelation: null,
      },
    });
    await db.phoneOtp.updateMany({ where: { memberId: m.id, usedAt: null }, data: { expiresAt: new Date() } });
  } else if (d.decision === "RESUME") {
    await db.member.update({ where: { id: m.id }, data: { suspendedAt: null } });
  }

  await db.incident.update({
    where: { id: incidentId },
    data: { status: "CLOSED", decision: d.decision, decisionNote: d.note?.trim() || null, decidedAt: new Date() },
  });
  const label =
    d.decision === "TRANSFER"
      ? `${actor.name} transfère la place de ${m.name} à ${d.heir.name} (${NETWORKS[d.heir.network]} ${maskPhone(d.heir.phone)}), sur justificatif ; versements bloqués jusqu'à la vérification de son numéro`
      : d.decision === "RESUME"
        ? `${actor.name} clôt le dossier de ${m.name} : reprise normale`
        : `${actor.name} clôt le dossier de ${m.name} : ${d.note!.trim()}`;
  await audit({ tontineId: m.tontineId, memberId: m.id, actorId: actor.id, action: `INCIDENT_${d.decision}`, label });

  if (d.decision === "TRANSFER") await inviteVerification(m.id, actor.id);
  if (d.decision !== "OTHER") await retryHeldPayouts([m.id]);
}
