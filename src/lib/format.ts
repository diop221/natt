export const NETWORKS: Record<string, string> = {
  wave: "Wave",
  orange_money: "Orange Money",
  free_money: "Free Money",
  expresso: "Expresso",
};

export const formatDate = (d: Date, locale = "fr") =>
  d.toLocaleDateString(locale === "wo" ? "fr-SN" : "fr-FR", { day: "numeric", month: "long", year: "numeric" });
