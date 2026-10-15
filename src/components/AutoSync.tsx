"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Recharge la page toutes les 3 s ; la page synchronise avec le fournisseur à chaque rendu.
// Pas de rechargement quand l'onglet est caché, pour ne pas charger le serveur pour rien.
// (En production, les webhooks Bitnob remplaceront cette boucle.)
export function AutoSync({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [active, router]);

  return null;
}
