// Ramène un numéro au format international (+221771234567).
// Un numéro sénégalais à 9 chiffres saisi sans indicatif reçoit +221.
export function normalizePhone(raw: string): string | null {
  let p = raw.replace(/[\s.()-]/g, "");
  if (p.startsWith("00")) p = `+${p.slice(2)}`;
  if (/^[0-9]{9}$/.test(p)) p = `+221${p}`;
  return /^\+[0-9]{8,15}$/.test(p) ? p : null;
}
