import { createHmac, timingSafeEqual } from "node:crypto";
import { botReply } from "@/lib/assistant";
import { notify } from "@/lib/notify";

// Webhook de l'API WhatsApp Cloud (Meta) : reçoit les messages des membres et répond.

// Vérification du webhook par Meta lors de sa configuration.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ok =
    url.searchParams.get("hub.mode") === "subscribe" &&
    !!process.env.WHATSAPP_VERIFY_TOKEN &&
    url.searchParams.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN;
  return ok ? new Response(url.searchParams.get("hub.challenge")) : new Response("Forbidden", { status: 403 });
}

type WebhookBody = {
  entry?: { changes?: { value?: { messages?: { from: string; type: string; text?: { body: string } }[] } }[] }[];
};

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (secret) {
    // Meta signe chaque appel avec le secret de l'application.
    const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`);
    const given = Buffer.from(req.headers.get("x-hub-signature-256") ?? "");
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return new Response("Bad signature", { status: 401 });
  } else if (process.env.NOTIFY_PROVIDER === "whatsapp") {
    return new Response("WHATSAPP_APP_SECRET manquant", { status: 500 });
  }

  const body = JSON.parse(raw || "{}") as WebhookBody;
  const messages = body.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages ?? []) ?? []) ?? [];
  for (const m of messages) {
    const phone = `+${m.from.replace(/\D/g, "")}`;
    const reply = await botReply(phone, m.type === "text" ? (m.text?.body ?? "") : "");
    await notify(phone, reply);
  }
  // Meta attend toujours une réponse 200, sinon il renvoie le message.
  return Response.json({ ok: true });
}
