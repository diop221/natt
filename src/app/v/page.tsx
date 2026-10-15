import { ActionForm } from "@/components/ActionForm";
import { getDict } from "@/lib/i18n";
import { lookupAction } from "./actions";

// Portail de vérification des attestations, ouvert à tous (banque, microfinance, bailleur…).
export default async function VerifyPortal() {
  const t = await getDict();
  const input = "input w-full";
  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">{t.verifyPortal.title}</h1>
      <p className="text-muted">{t.verifyPortal.help}</p>
      <ActionForm action={lookupAction} className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm">{t.verifyPortal.number}</span>
          <input name="number" required placeholder="NATT-2026-…" className={`${input} font-mono uppercase`} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">{t.verifyPortal.name}</span>
          <input name="name" required className={input} />
        </label>
        <button className="btn">{t.verifyPortal.check}</button>
      </ActionForm>
    </div>
  );
}
