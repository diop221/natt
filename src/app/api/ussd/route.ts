import { localeFor, payLinksText, scoreText, statusText } from "@/lib/assistant";
import { notify } from "@/lib/notify";
import { normalizePhone } from "@/lib/phone";

// Menu USSD (format Africa's Talking) pour les téléphones sans internet.
// Réponse texte : « CON … » continue la session, « END … » la termine.
// Protégé par USSD_SECRET, passé dans l'URL de rappel (?secret=…).

const MENU = {
  fr: "CON Natt\n1. Mes tontines\n2. Mon score\n3. Recevoir mes liens de paiement",
  wo: "CON Natt\n1. Samay natt\n2. Sama score\n3. Jot say lien fey",
};
const SENT = { fr: "END Liens envoyés par message.", wo: "END Yónne nañu la say lien." };

export async function POST(req: Request) {
  const secret = process.env.USSD_SECRET;
  if (secret && new URL(req.url).searchParams.get("secret") !== secret) return new Response("Forbidden", { status: 403 });
  if (!secret && process.env.PAYMENT_PROVIDER === "bitnob") return new Response("USSD_SECRET manquant", { status: 500 });

  const form = await req.formData();
  const phone = normalizePhone(String(form.get("phoneNumber") ?? ""));
  const text = String(form.get("text") ?? "");
  if (!phone) return reply("END Numéro invalide.");
  const l = await localeFor(phone);
  const choice = text.split("*").pop();

  if (text === "") return reply(MENU[l]);
  // Les écrans USSD sont courts (environ 180 caractères) : on coupe si besoin.
  if (choice === "1") return reply(`END ${(await statusText(phone, l)).slice(0, 170)}`);
  if (choice === "2") return reply(`END ${(await scoreText(phone, l)).slice(0, 170)}`);
  if (choice === "3") {
    await notify(phone, await payLinksText(phone, l));
    return reply(SENT[l]);
  }
  return reply(MENU[l]);
}

const reply = (text: string) => new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
