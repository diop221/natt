"use server";

import { revalidatePath } from "next/cache";
import { canManageTontine, canViewTontine } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDict, tf } from "@/lib/i18n";
import { MAX_PAYOUT_XOF, MIN_PAYOUT_XOF, formatXof } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";
import { decideIncident, recordEvidence, reportIncident, setContacts, suspendMember } from "@/lib/incidents";
import { confirmReceived } from "@/lib/merchants";
import { answerSwap, cancelSwap, decideSwap, requestSwap } from "@/lib/swaps";
import { isMockProvider } from "@/lib/payments";
import { simulateMockPayment } from "@/lib/payments/mock";
import {
  NattError,
  coverContribution,
  createSolidarityRequest,
  decideSolidarityRequest,
  executePayout,
  placeBid,
  processRoundPayouts,
  sendAnnouncement,
  sendReminders,
  setVoiceNotes,
  syncTontine,
} from "@/lib/tontine";
import { confirmByOrganizer, inviteVerification, updatePaymentDetails } from "@/lib/verification";

export type ActionState = { error?: string; ok?: string } | undefined;

const str = (form: FormData, key: string) => String(form.get(key) ?? "");

// Exécute une action réservée aux personnes qui voient (ou gèrent) la tontine,
// et transforme les erreurs prévues en message affichable.
async function run(tontineId: string, level: "view" | "manage", fn: (userId: string, userName: string) => Promise<string | void>): Promise<ActionState> {
  const user = await getCurrentUser();
  const allowed = user && (level === "manage" ? await canManageTontine(user.id, tontineId) : await canViewTontine(user.id, tontineId));
  if (!user || !allowed) return { error: "Action non autorisée." };
  try {
    const ok = await fn(user.id, user.name);
    revalidatePath(`/tontines/${tontineId}`);
    return { ok: ok || undefined };
  } catch (err) {
    if (err instanceof NattError) return { error: err.message };
    throw err;
  }
}

async function myMember(tontineId: string, userId: string) {
  const member = await db.member.findFirst({ where: { tontineId, userId } });
  if (!member) throw new NattError("Vous n'êtes pas membre de cette tontine.");
  return member;
}

export async function remindAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const tontineId = str(form, "tontineId");
  const t = await getDict();
  return run(tontineId, "manage", async (_, name) => tf(t.tontine.reminded, { n: await sendReminders(tontineId, name) }));
}

export async function coverAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const c = await db.contribution.findUnique({ where: { id: str(form, "contributionId") }, include: { round: true } });
  if (!c) return { error: "Cotisation introuvable." };
  return run(c.round.tontineId, "manage", () => coverContribution(c.id));
}

export async function retryAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const payout = await db.payout.findUnique({ where: { id: str(form, "payoutId") } });
  if (!payout) return { error: "Versement introuvable." };
  return run(payout.tontineId, "manage", async () => {
    if (payout.roundId) await processRoundPayouts(payout.roundId);
    else await executePayout(payout.id);
  });
}

export async function bidAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const round = await db.round.findUnique({ where: { id: str(form, "roundId") } });
  if (!round) return { error: "Tour introuvable." };
  return run(round.tontineId, "view", async (userId) => {
    const member = await myMember(round.tontineId, userId);
    await placeBid(round.id, member.id, Number(form.get("amount")));
  });
}

export async function requestAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const tontineId = str(form, "tontineId");
  return run(tontineId, "view", async (userId) => {
    const member = await myMember(tontineId, userId);
    const amountXof = Number(form.get("amount"));
    const reason = str(form, "reason");
    const description = str(form, "description").trim().slice(0, 200);
    if (!Number.isInteger(amountXof) || amountXof < MIN_PAYOUT_XOF || amountXof > MAX_PAYOUT_XOF) {
      throw new NattError(`Le montant doit être compris entre ${formatXof(MIN_PAYOUT_XOF)} et ${formatXof(MAX_PAYOUT_XOF)}.`);
    }
    if (!["DEATH", "WEDDING", "BAPTISM", "HEALTH", "OTHER"].includes(reason) || !description) throw new NattError("Indiquez le motif.");
    await createSolidarityRequest(member.id, { reason, description, amountXof });
  });
}

export async function decideAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const req = await db.solidarityRequest.findUnique({ where: { id: str(form, "requestId") } });
  if (!req) return { error: "Demande introuvable." };
  return run(req.tontineId, "manage", () => decideSolidarityRequest(req.id, form.get("approve") === "1"));
}

// Mode simulé : marque une facture comme payée (cotisation ou pénalité).
export async function simulatePayAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!isMockProvider()) return { error: "Indisponible." };
  const id = str(form, "id");
  const c = await db.contribution.findUnique({ where: { id }, include: { round: true } });
  const ch = c ? null : await db.charge.findUnique({ where: { id } });
  const tontineId = c?.round.tontineId ?? ch?.tontineId;
  const invoiceId = c?.invoiceId ?? ch?.invoiceId;
  if (!tontineId || !invoiceId) return { error: "Introuvable." };
  return run(tontineId, "view", async () => {
    await simulateMockPayment(invoiceId);
    await syncTontine(tontineId);
  });
}

// ─── Numéros de versement ──────────────────────────────────────────────────

async function memberOf(form: FormData) {
  return db.member.findUnique({ where: { id: str(form, "memberId") } });
}

export async function inviteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const m = await memberOf(form);
  if (!m) return { error: "Membre introuvable." };
  const t = await getDict();
  return run(m.tontineId, "manage", async (userId) => {
    await inviteVerification(m.id, userId);
    return t.verify.invited;
  });
}

export async function confirmAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const m = await memberOf(form);
  if (!m) return { error: "Membre introuvable." };
  return run(m.tontineId, "manage", (userId, name) => confirmByOrganizer(m.id, userId, name));
}

export async function editPaymentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const m = await memberOf(form);
  if (!m) return { error: "Membre introuvable." };
  return run(m.tontineId, "manage", async (userId) => {
    const phone = normalizePhone(str(form, "phone"));
    const network = str(form, "network");
    if (!phone) throw new NattError("Numéro de téléphone invalide.");
    if (!["wave", "orange_money", "free_money", "expresso"].includes(network)) throw new NattError("Réseau invalide.");
    await updatePaymentDetails(m.id, { phone, network }, userId);
  });
}

// ─── Échanges de tours ─────────────────────────────────────────────────────

export async function swapRequestAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const tontineId = str(form, "tontineId");
  const t = await getDict();
  return run(tontineId, "view", async (userId) => {
    const me = await myMember(tontineId, userId);
    await requestSwap(str(form, "handId"), str(form, "partnerHandId"), me.id, userId);
    return t.swap.sent;
  });
}

export async function swapAnswerAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const swap = await db.turnSwap.findUnique({ where: { id: str(form, "swapId") } });
  if (!swap) return { error: "Demande introuvable." };
  return run(swap.tontineId, "view", async (userId) => {
    const me = await myMember(swap.tontineId, userId);
    await answerSwap(swap.id, me.id, form.get("accept") === "1", userId);
  });
}

export async function swapDecideAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const swap = await db.turnSwap.findUnique({ where: { id: str(form, "swapId") } });
  if (!swap) return { error: "Demande introuvable." };
  return run(swap.tontineId, "manage", (userId, name) => decideSwap(swap.id, form.get("approve") === "1", userId, name));
}

export async function swapCancelAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const swap = await db.turnSwap.findUnique({ where: { id: str(form, "swapId") } });
  if (!swap) return { error: "Demande introuvable." };
  return run(swap.tontineId, "view", async (userId) => {
    const me = await myMember(swap.tontineId, userId);
    await cancelSwap(swap.id, me.id, userId);
  });
}

// ─── Messages vocaux et annonces ───────────────────────────────────────────

// Le membre lui-même, ou l'organisateur pour un membre.
export async function voiceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const m = await memberOf(form);
  const user = await getCurrentUser();
  if (!m || !user) return { error: "Action non autorisée." };
  return run(m.tontineId, m.userId === user.id ? "view" : "manage", (userId) => setVoiceNotes(m.id, form.get("on") === "1", userId));
}

export async function announceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const tontineId = str(form, "tontineId");
  const t = await getDict();
  return run(tontineId, "manage", async (userId, name) =>
    tf(t.announce.sent, { n: await sendAnnouncement(tontineId, str(form, "text"), { id: userId, name }) }),
  );
}

// ─── Contacts, situations exceptionnelles ──────────────────────────────────

const optionalPhone = (form: FormData, key: string) => {
  const raw = str(form, key).trim();
  if (!raw) return null;
  const phone = normalizePhone(raw);
  if (!phone) throw new NattError("Numéro de téléphone invalide.");
  return phone;
};
const optionalText = (form: FormData, key: string) => str(form, key).trim().slice(0, 60) || null;

export async function contactsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const tontineId = str(form, "tontineId");
  const t = await getDict();
  return run(tontineId, "view", async (userId) => {
    const me = await myMember(tontineId, userId);
    await setContacts(
      me.id,
      {
        emergencyName: optionalText(form, "emergencyName"),
        emergencyPhone: optionalPhone(form, "emergencyPhone"),
        heirName: optionalText(form, "heirName"),
        heirPhone: optionalPhone(form, "heirPhone"),
        heirRelation: optionalText(form, "heirRelation"),
      },
      userId,
    );
    return t.contacts.saved;
  });
}

export async function reportIncidentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const m = await memberOf(form);
  if (!m) return { error: "Membre introuvable." };
  return run(m.tontineId, "view", async (userId, name) => {
    const description = str(form, "description").trim().slice(0, 300);
    if (!description) throw new NattError("Décrivez la situation.");
    await reportIncident(m.id, { kind: str(form, "kind"), description }, { id: userId, name });
  });
}

async function incidentOf(form: FormData) {
  return db.incident.findUnique({ where: { id: str(form, "incidentId") } });
}

export async function suspendAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const incident = await incidentOf(form);
  if (!incident) return { error: "Dossier introuvable." };
  return run(incident.tontineId, "manage", (userId, name) => suspendMember(incident.id, { id: userId, name }));
}

export async function evidenceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const incident = await incidentOf(form);
  if (!incident) return { error: "Dossier introuvable." };
  return run(incident.tontineId, "manage", (userId, name) => recordEvidence(incident.id, str(form, "evidence").slice(0, 300), { id: userId, name }));
}

export async function decideIncidentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const incident = await incidentOf(form);
  if (!incident) return { error: "Dossier introuvable." };
  return run(incident.tontineId, "manage", async (userId, name) => {
    const actor = { id: userId, name };
    const note = str(form, "note").trim().slice(0, 300);
    const decision = str(form, "decision");
    if (decision === "RESUME") return decideIncident(incident.id, { decision, note }, actor);
    if (decision === "OTHER") return decideIncident(incident.id, { decision, note }, actor);
    if (decision !== "TRANSFER") throw new NattError("Choisissez une décision.");
    const phone = normalizePhone(str(form, "heirPhone"));
    const heirName = str(form, "heirName").trim().slice(0, 60);
    const network = str(form, "network");
    if (!heirName || !phone) throw new NattError("Indiquez le nom et le numéro de l'ayant droit.");
    if (!["wave", "orange_money", "free_money", "expresso"].includes(network)) throw new NattError("Réseau invalide.");
    return decideIncident(incident.id, { decision, note, heir: { name: heirName, phone, network } }, actor);
  });
}

// ─── Natt Marchands ────────────────────────────────────────────────────────

// Le membre concerné, ou l'organisateur à sa place, confirme la réception de l'article.
export async function confirmOrderAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const order = await db.order.findUnique({ where: { id: str(form, "orderId") }, include: { member: true } });
  const user = await getCurrentUser();
  if (!order || !user) return { error: "Action non autorisée." };
  return run(order.tontineId, order.member.userId === user.id ? "view" : "manage", (userId) => confirmReceived(order.id, userId));
}
