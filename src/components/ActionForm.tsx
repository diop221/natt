"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/tontines/[id]/actions";

// Formulaire relié à une action serveur, qui affiche le message d'erreur ou de succès.
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {state?.error && <p className="basis-full text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="basis-full text-sm text-accent">{state.ok}</p>}
    </form>
  );
}
