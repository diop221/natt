import { db } from "@/lib/db";
import { appUrl } from "@/lib/i18n/notifications";
import { formatXof } from "@/lib/money";
import { reliability } from "@/lib/score";

// Logique partagée par le bot WhatsApp et le menu USSD.
// Le membre est reconnu par son numéro, même sans compte Natt.

type Locale = "fr" | "wo";

const T = {
  menu: {
    fr: "Natt 👋 Écrivez :\n• STATUT : vos tontines\n• PAYER : vos liens de paiement\n• SCORE : votre fiabilité\n• AIDE : ce menu",
    wo: "Natt 👋 Bindal :\n• STATUT : say natt\n• FEY : say lien fey\n• SCORE : sa jàmm-jàmm\n• NDIMBAL : menu bii",
  },
  none: { fr: "Aucune tontine n'est liée à ce numéro.", wo: "Amul benn natt bu boole ak nimero bii." },
  paid: { fr: "payé ✅", wo: "fey na ✅" },
  due: { fr: "{amount} à payer", wo: "{amount} nga war a fey" },
  nothingToPay: { fr: "Rien à payer pour l'instant. 👍", wo: "Amul dara lu nga war a fey léegi. 👍" },
  noAccount: { fr: "Créez un compte Natt avec ce numéro pour avoir un score : {link}", wo: "Sosal compte Natt ak nimero bii ngir am score : {link}" },
  tooShort: { fr: "Pas encore de score (moins de 3 cotisations échues).", wo: "Amagul score (3 natt yu jot amagul)." },
  score: { fr: "Fiabilité : {score}/100 · {onTime} à temps, {late} en retard, {missed} manquées.", wo: "Jàmm-jàmm : {score}/100 · {onTime} ci waxtu, {late} yeex, {missed} feyuñu." },
} as const;

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
const say = (l: Locale, key: keyof typeof T, v: Record<string, string | number> = {}) => fill(T[key][l], v);

export async function localeFor(phone: string): Promise<Locale> {
  const user = await db.user.findUnique({ where: { phone }, select: { locale: true } });
  return user?.locale === "wo" ? "wo" : "fr";
}

// Cotisations et pénalités en attente pour ce numéro (comme membre ou comme proche qui cotise).
async function dues(phone: string) {
  const [contributions, charges] = await Promise.all([
    db.contribution.findMany({
      where: { status: "pending", round: { status: "COLLECTING" }, member: { OR: [{ phone }, { sponsorPhone: phone }] } },
      include: { member: true, round: { include: { tontine: true } } },
    }),
    db.charge.findMany({ where: { status: "pending", member: { phone } }, include: { tontine: true } }),
  ]);
  return [
    ...contributions.map((c) => ({
      label: `${c.round.tontine.name}${c.member.phone === phone ? "" : ` (${c.member.name})`}`,
      amount: c.amountXof - c.creditUsedXof + c.guaranteeXof,
      id: c.id,
    })),
    ...charges.map((ch) => ({ label: `${ch.tontine.name} · ${ch.kind === "PENALTY" ? "pénalité" : "remboursement"}`, amount: ch.amountXof, id: ch.id })),
  ];
}

export async function statusText(phone: string, l: Locale) {
  const members = await db.member.findMany({
    where: { phone, tontine: { status: { in: ["ACTIVE", "DRAWING"] } } },
    include: { tontine: true, contributions: { include: { round: true } } },
  });
  if (members.length === 0) return say(l, "none");
  return members
    .map((m) => {
      const c = m.contributions.find((c) => c.round.number === m.tontine.currentRound);
      const state = !c || c.status !== "pending" ? say(l, "paid") : say(l, "due", { amount: formatXof(c.amountXof - c.creditUsedXof + c.guaranteeXof) });
      return `• ${m.tontine.name} (${m.tontine.currentRound}/${m.tontine.totalRounds}) : ${state}`;
    })
    .join("\n");
}

export async function payLinksText(phone: string, l: Locale) {
  const list = await dues(phone);
  if (list.length === 0) return say(l, "nothingToPay");
  return list.map((d) => `• ${d.label} : ${formatXof(d.amount)}\n  ${appUrl(`/pay/${d.id}`)}`).join("\n");
}

export async function scoreText(phone: string, l: Locale) {
  const user = await db.user.findUnique({ where: { phone } });
  if (!user) return say(l, "noAccount", { link: appUrl("/signup") });
  const r = await reliability(user.id);
  return r.score === null ? say(l, "tooShort") : say(l, "score", { score: r.score, onTime: r.onTime, late: r.late, missed: r.missed });
}

// Réponse du bot WhatsApp à un message texte.
export async function botReply(phone: string, text: string) {
  const l = await localeFor(phone);
  const word = text.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/)[0] ?? "";
  if (["statut", "status", "solde", "xool"].includes(word)) return statusText(phone, l);
  if (["payer", "pay", "fey", "lien", "liens"].includes(word)) return payLinksText(phone, l);
  if (["score", "fiabilite", "jamm"].includes(word)) return scoreText(phone, l);
  return say(l, "menu");
}
