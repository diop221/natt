import { Lock } from "lucide-react";
import Link from "next/link";

// Compte connecté mais hors de l'équipe Natt : on explique plutôt que d'afficher une page introuvable.
export function AdminOnly() {
  return (
    <div className="card mx-auto max-w-lg space-y-4 p-8 text-center">
      <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <Lock size={22} />
      </span>
      <h1 className="text-2xl font-bold">Réservé à l&apos;équipe Natt</h1>
      <p className="text-sm text-muted">
        Ce compte n&apos;a pas accès à l&apos;administration. Ajoutez son numéro à <code className="font-mono">NATT_ADMIN_PHONES</code> (séparés par des
        virgules) dans la configuration du serveur, puis rechargez la page.
      </p>
      <Link href="/" className="btn">
        Retour au tableau de bord
      </Link>
    </div>
  );
}
