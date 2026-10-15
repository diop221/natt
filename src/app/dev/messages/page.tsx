import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { isMockProvider } from "@/lib/payments";

export const dynamic = "force-dynamic";

// Mode simulé uniquement : les messages WhatsApp qui seraient partis.
export default async function DevMessages() {
  if (!isMockProvider()) notFound();
  await requireUser("/dev/messages");
  const [t, messages] = await Promise.all([getDict(), db.notification.findMany({ orderBy: { createdAt: "desc" }, take: 100 })]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t.dev.messages}</h1>
      {messages.length === 0 ? (
        <p className="text-muted">{t.dev.none}</p>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => (
            <li key={m.id} className="card p-3 text-sm">
              <p className="mb-1 text-xs text-muted">
                {m.channel === "voice" && "🔊 message vocal (wolof) · "}{m.phone} · {m.createdAt.toLocaleString("fr-FR")} · {m.status}
              </p>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
