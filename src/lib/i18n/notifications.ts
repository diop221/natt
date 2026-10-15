// Messages WhatsApp, en français et en wolof.
// Les textes en wolof sont à faire relire par un locuteur avant la mise en production.

export type Locale = "fr" | "wo";

export type Vars = Record<string, string | number>;
const fill = (s: string, v: Vars) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

const T = {
  open: {
    fr: "Natt · {tontine} · tour {round} : votre cotisation de {amount} est à payer avant le {date}. Payez ici : {link}",
    wo: "Natt · {tontine} · tour {round} : sa natt bu {amount} war nga ko fey balaa {date}. Fey fii : {link}",
  },
  sponsorOpen: {
    fr: "Natt · {tontine} : la cotisation de {member} ({amount}) est ouverte. Vous pouvez la payer ici : {link}",
    wo: "Natt · {tontine} : natt bu {member} ({amount}) ubbeeku na. Mën nga ko fey fii : {link}",
  },
  due: {
    fr: "Rappel Natt · {tontine} : votre cotisation de {amount} est due demain. {link}",
    wo: "Fàttali Natt · {tontine} : sa natt bu {amount}, ëllëg la war. {link}",
  },
  late: {
    fr: "Natt · {tontine} : votre cotisation de {amount} est en retard.{penalty} {link}",
    wo: "Natt · {tontine} : sa natt bu {amount} yeex na.{penalty} {link}",
  },
  penalty: {
    fr: " Une pénalité de {amount} s'ajoute.",
    wo: " Pénalité bu {amount} dina ci yokku.",
  },
  reminder: {
    fr: "Natt · {tontine} : petit rappel de {owner}, votre cotisation de {amount} n'est pas encore payée. {link}",
    wo: "Natt · {tontine} : {owner} di la fàttali, sa natt bu {amount} feyagul. {link}",
  },
  payout: {
    fr: "Natt · {tontine} : {amount} ont été envoyés sur votre compte {network}. Bonne réception !",
    wo: "Natt · {tontine} : yónne nañu {amount} ci sa {network}. Jërëjëf !",
  },
  requestNew: {
    fr: "Natt · {tontine} : {member} demande {amount} à la caisse ({reason}). Décidez ici : {link}",
    wo: "Natt · {tontine} : {member} mi ngi laaj {amount} ci kees bi ({reason}). Tànnal fii : {link}",
  },
  requestApproved: {
    fr: "Natt · {tontine} : votre demande de {amount} est acceptée, le versement est en cours.",
    wo: "Natt · {tontine} : nangu nañu sa laaj bu {amount}, yónnee bi mi ngi dem.",
  },
  requestRejected: {
    fr: "Natt · {tontine} : votre demande de {amount} n'a pas été acceptée.",
    wo: "Natt · {tontine} : nanguwuñu sa laaj bu {amount}.",
  },
  verifyInvite: {
    fr: "Natt · {tontine} : vos versements iront sur {network} {phone}. Confirmez ce numéro ici : {link}",
    wo: "Natt · {tontine} : sa xaalis dina dem ci {network} {phone}. Dëggal limu telefon bi fii : {link}",
  },
  otp: {
    fr: "Natt : votre code de vérification est {code}. Il expire dans 15 minutes. Ne le donnez à personne.",
    wo: "Natt : sa code mooy {code}. Dina jeex ci 15 minit. Bul ko jox kenn.",
  },
  payoutBlocked: {
    fr: "Natt · {tontine} : le versement de {amount} à {member} attend la vérification de son numéro. {link}",
    wo: "Natt · {tontine} : yónnee bu {amount} ci {member} mi ngi xaar ñu dëggal limu telefonam. {link}",
  },
  swapRequest: {
    fr: "Natt · {tontine} : {member} vous propose d'échanger son tour {from} contre votre tour {to}. Répondez ici : {link}",
    wo: "Natt · {tontine} : {member} dafa bëgg ngeen weccante tour : moom tour {from}, yaw tour {to}. Tontuleen fii : {link}",
  },
  swapToOrganizer: {
    fr: "Natt · {tontine} : {a} (tour {from}) et {b} (tour {to}) sont d'accord pour échanger leurs tours. Validez ici : {link}",
    wo: "Natt · {tontine} : {a} (tour {from}) ak {b} (tour {to}) dëkkoo nañu ngir weccante seen tour. Dëggalal fii : {link}",
  },
  swapApplied: {
    fr: "Natt · {tontine} : échange de tour validé. Vous recevrez la cagnotte au tour {round}, vers le {date}.",
    wo: "Natt · {tontine} : weccante tour bi dëggal nañu ko. Dinga jot xaalis bi ci tour {round}, ci wetu {date}.",
  },
  swapDeclined: {
    fr: "Natt · {tontine} : votre demande d'échange de tour avec {member} n'a pas abouti.",
    wo: "Natt · {tontine} : sa laaj ngir weccante tour ak {member} amul.",
  },
  reserveReleased: {
    fr: "Natt · {tontine} : le cycle est terminé. Votre réserve de {amount} vous a été rendue sur {network}.",
    wo: "Natt · {tontine} : natt bi jeex na. Sa dencukaay bu {amount} delloo nañu la ko ci {network}.",
  },
  announcement: {
    fr: "Natt · {tontine} · message de {owner} : {text}",
    wo: "Natt · {tontine} · bataaxal bu {owner} : {text}",
  },
  incidentReported: {
    fr: "Natt · {tontine} : une situation exceptionnelle a été signalée pour {member} ({kind}). À traiter ici : {link}",
    wo: "Natt · {tontine} : am na lu xewoo {member} ({kind}). Xoolal ko fii : {link}",
  },
  orderMerchant: {
    fr: "Natt Marchands : commande « {offer} » pour {member} ({phone}), payée {amount} sur votre compte. Indiquez la livraison ici : {link}",
    wo: "Natt Marchands : commande « {offer} » ngir {member} ({phone}), fey nañu {amount} ci sa compte. Wax nu bu nga ko joxee fii : {link}",
  },
  orderPaid: {
    fr: "Natt · {tontine} : votre achat « {offer} » chez {merchant} est réglé. {delivery}",
    wo: "Natt · {tontine} : sa njënd « {offer} » ca {merchant} fey nañu ko. {delivery}",
  },
  orderDelivered: {
    fr: "Natt · {tontine} : {merchant} indique avoir livré « {offer} ». Confirmez la réception ici : {link}",
    wo: "Natt · {tontine} : {merchant} nee na jox na la « {offer} ». Dëggalal ne jot nga ko fii : {link}",
  },
} satisfies Record<string, Record<Locale, string>>;

// Messages vocaux en wolof : le texte lu par la synthèse vocale, sans lien.
// À faire relire et écouter par des locuteurs avant la mise en production (tournures, montants).
const V = {
  open: "Salaam aleekum {name}. Natt {tontine}, tour {round} : sa natt bu {amount} ubbeeku na. War nga ko fey balaa {date}.",
  due: "Salaam aleekum {name}. Natt {tontine} : sa natt bu {amount}, ëllëg la war. Bul fàtte.",
  late: "Salaam aleekum {name}. Natt {tontine} : sa natt bu {amount} yeex na. Fey ko ci lu gaaw.",
  confirmed: "Salaam aleekum {name}. Natt {tontine} : natt bu {member}, {amount}, agsi na. Des na {left} natt balaa ñuy yónne xaalis bi.",
  payout: "Salaam aleekum {name}. Natt {tontine} : yónne nañu {amount} ci sa {network}. Jërëjëf.",
  swapApplied: "Salaam aleekum {name}. Natt {tontine} : sa tour soppi na. Dinga jot xaalis bi ci tour {round}, ci wetu {date}.",
  reserveReleased: "Salaam aleekum {name}. Natt {tontine} jeex na. Delloo nañu la sa dencukaay bu {amount} ci sa {network}.",
  orderPaid: "Salaam aleekum {name}. Natt {tontine} : sa njënd, {offer}, ca {merchant}, fey nañu ko.",
  announcement: "Salaam aleekum {name}. Bataaxal bu {owner}, ki yor natt {tontine} : {text}",
} as const;
export type VoiceKey = keyof typeof V;
export const hasVoice = (key: string): key is VoiceKey => key in V;
// Les espaces insécables des montants (« 25 000 ») deviennent des espaces simples pour la synthèse.
export const voiceMsg = (key: VoiceKey, vars: Vars) => fill(V[key], vars).replace(/[\u202f\u00a0]/g, " ");

export type MsgKey = keyof typeof T;

export function msg(locale: string | null | undefined, key: MsgKey, vars: Vars = {}) {
  const l: Locale = locale === "wo" ? "wo" : "fr";
  return fill(T[key][l], vars);
}

export const appUrl = (path: string) => `${process.env.APP_URL ?? "http://localhost:3000"}${path}`;
