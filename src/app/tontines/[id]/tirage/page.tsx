import Link from "next/link";
import { notFound } from "next/navigation";
import { canViewTontine } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { drawOrder } from "@/lib/chain";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Preuve du tirage : tout membre peut refaire le calcul avec le hash du bloc publié.
export default async function DrawProofPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/tontines/${id}/tirage`);
  if (!(await canViewTontine(user.id, id))) notFound();
  const tontine = await db.tontine.findUnique({
    where: { id },
    include: { hands: { orderBy: { position: "asc" }, include: { holders: { include: { member: true }, orderBy: { id: "asc" } } } } },
  });
  if (!tontine || tontine.orderMode !== "DRAW") notFound();

  // Ce sont les mains (tours) qui sont tirées ; une demi-main partagée porte le nom de ses deux titulaires.
  const hands = tontine.hands.map((h) => ({ id: h.id, name: h.holders.map((x) => x.member.name).join(" + ") }));
  const order = tontine.drawBlockHash ? drawOrder(tontine.drawBlockHash, hands) : null;
  const swapped = (await db.turnSwap.count({ where: { tontineId: id, status: "APPLIED" } })) > 0;
  const explorer = `https://mempool.space/block/${tontine.drawBlockHash ?? tontine.drawBlockHeight}`;
  const snippet = `// Node.js : refait le tirage
const { createHash } = require("node:crypto");
const hash = "${tontine.drawBlockHash ?? "<hash du bloc>"}";
const mains = ${JSON.stringify(hands.map((h) => ({ id: h.id, nom: h.name })))};
const cle = (m) => createHash("sha256").update(hash + ":" + m.id).digest("hex");
console.log(mains.sort((a, b) => cle(a).localeCompare(cle(b))).map((m) => m.nom));`;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href={`/tontines/${id}`} className="text-sm text-accent">← {tontine.name}</Link>
        <h1 className="text-2xl font-bold">Preuve du tirage au sort</h1>
        <p className="text-muted">
          À la création de la tontine, Natt a choisi le bloc Bitcoin n° <strong>{tontine.drawBlockHeight}</strong>, qui n&apos;existait pas encore.
          Personne, pas même l&apos;organisateur, ne pouvait donc connaître son hash à l&apos;avance.
        </p>
      </div>

      <section className="space-y-2 card p-4 text-sm">
        <h2 className="font-semibold">Bloc utilisé</h2>
        {tontine.drawBlockHash ? (
          <>
            <p className="break-all font-mono text-xs">{tontine.drawBlockHash}</p>
            <a href={explorer} target="_blank" rel="noreferrer" className="font-medium text-accent">
              Vérifier ce bloc sur mempool.space ↗
            </a>
            {process.env.CHAIN_PROVIDER !== "mempool" && process.env.PAYMENT_PROVIDER !== "bitnob" && (
              <p className="text-warn">Mode simulé : ce hash est fictif et n&apos;existe pas sur la vraie blockchain.</p>
            )}
          </>
        ) : (
          <p className="text-muted">Bloc pas encore miné : le tirage aura lieu dans une dizaine de minutes.</p>
        )}
      </section>

      <section className="space-y-2 card p-4 text-sm">
        <h2 className="font-semibold">Méthode</h2>
        <p className="text-muted">
          Pour chaque main (tour de passage), on calcule <code>sha256(hash du bloc + &quot;:&quot; + identifiant de la main)</code>. Les mains
          passent dans l&apos;ordre croissant de ce résultat.
        </p>
        {swapped && <p className="text-warn">Des échanges de tours ont modifié cet ordre depuis le tirage : ils sont inscrits au journal de la tontine.</p>}
        {order && (
          <ol className="space-y-1">
            {order.map((m, i) => (
              <li key={m.id} className="flex flex-wrap gap-x-3">
                <span className="w-5 font-mono text-muted">{i + 1}</span>
                <span className="font-medium">{m.name}</span>
                <span className="break-all font-mono text-xs text-muted">{m.drawKey.slice(0, 16)}…</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-2 card p-4 text-sm">
        <h2 className="font-semibold">Refaire le calcul</h2>
        <pre className="overflow-x-auto rounded-lg bg-background p-3 text-xs">{snippet}</pre>
      </section>
    </div>
  );
}
