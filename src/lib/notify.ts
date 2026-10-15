import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { type MsgKey, type Vars, hasVoice, msg, voiceMsg } from "@/lib/i18n/notifications";
import { synthesizeWolof } from "@/lib/voice";

// Envoi de messages WhatsApp. En mode « mock », les messages sont seulement enregistrés
// et visibles sur /dev/messages.
// `key` rend l'envoi idempotent : un rappel déjà envoyé ne part pas une deuxième fois.

async function sendWhatsApp(phone: string, body: string) {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = process.env;
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) throw new Error("WHATSAPP_TOKEN et WHATSAPP_PHONE_NUMBER_ID sont requis");
  // API WhatsApp Cloud (Meta). Hors de la fenêtre de 24 h après un message du membre,
  // Meta n'accepte que des modèles de message approuvés : à prévoir avant la production.
  const res = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: phone.replace("+", ""), type: "text", text: { body } }),
  });
  if (!res.ok) throw new Error(`WhatsApp HTTP ${res.status}`);
}

// Note vocale : le fichier est d'abord déposé chez Meta, puis envoyé comme message audio.
// Comme le texte libre, un message audio n'est accepté que dans la fenêtre de 24 h qui suit
// un message du membre ; en dehors, Meta le refuse et l'échec est enregistré.
async function sendWhatsAppAudio(phone: string, script: string) {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = process.env;
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) throw new Error("WHATSAPP_TOKEN et WHATSAPP_PHONE_NUMBER_ID sont requis");
  const { audio, mimeType } = await synthesizeWolof(script);
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append("file", audio, mimeType === "audio/ogg" ? "natt.ogg" : "natt.mp3");
  const upload = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    body: form,
  });
  if (!upload.ok) throw new Error(`WhatsApp média HTTP ${upload.status}`);
  const { id } = (await upload.json()) as { id: string };
  const res = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: phone.replace("+", ""), type: "audio", audio: { id } }),
  });
  if (!res.ok) throw new Error(`WhatsApp HTTP ${res.status}`);
}

// Message texte ; `voice` : message vocal en wolof (le texte lu), enregistré avec le canal « voice ».
export async function notify(phone: string, body: string, key?: string, channel: "whatsapp" | "voice" = "whatsapp") {
  let id: string;
  try {
    ({ id } = await db.notification.create({ data: { key, phone, channel, body } }));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return; // déjà envoyé
    throw err;
  }
  if (process.env.NOTIFY_PROVIDER !== "whatsapp") return;
  try {
    if (channel === "voice") await sendWhatsAppAudio(phone, body);
    else await sendWhatsApp(phone, body);
  } catch (err) {
    await db.notification.update({
      where: { id },
      data: { status: "FAILED", error: err instanceof Error ? err.message : String(err) },
    });
  }
}

// Message à un membre, dans sa langue ; s'il l'a choisi, aussi en message vocal en wolof.
type Recipient = { phone: string; name: string; voiceNotes?: boolean; user?: { locale: string } | null };

export async function tell(to: Recipient, key: MsgKey, vars: Vars, notifKey?: string) {
  await notify(to.phone, msg(to.user?.locale, key, vars), notifKey);
  if (to.voiceNotes && hasVoice(key)) {
    await notify(to.phone, voiceMsg(key, { ...vars, name: to.name }), notifKey && `${notifKey}:voice`, "voice");
  }
}

// Clés déjà utilisées, pour éviter une écriture par rappel à chaque synchronisation.
export async function sentKeys(keys: string[]) {
  if (keys.length === 0) return new Set<string>();
  const rows = await db.notification.findMany({ where: { key: { in: keys } }, select: { key: true } });
  return new Set(rows.map((r) => r.key!));
}
