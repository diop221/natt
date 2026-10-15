"use client";

import { createContext, useContext } from "react";
import type { Dict } from "@/lib/i18n/fr";

// Le dictionnaire de la langue choisie, pour les composants client.
const I18nContext = createContext<Dict | null>(null);

export function I18nProvider({ dict, children }: { dict: Dict; children: React.ReactNode }) {
  return <I18nContext.Provider value={dict}>{children}</I18nContext.Provider>;
}

export function useDict() {
  const dict = useContext(I18nContext);
  if (!dict) throw new Error("useDict doit être utilisé dans I18nProvider");
  return dict;
}
