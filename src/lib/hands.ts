// Demi-mains et doubles mains (tontines classiques uniquement).
// Les parts sont comptées en demi-mains : 1 = demi-main, 2 = main entière, 4 = double main.
// Une main est un tour de passage : un seul titulaire (main entière) ou deux titulaires d'une
// demi-main chacun, qui se partagent la cagnotte de ce tour.
// Module sans accès à la base : utilisé par le formulaire, l'API et le moteur.

export const SHARE_HALVES = [1, 2, 4] as const;
export type ShareHalves = (typeof SHARE_HALVES)[number];

// Une main : les indices des membres qui la tiennent, dans la liste des membres.
export type HandPlan = number[];

// Ordre par défaut : dans l'ordre de la liste ; une double main prend deux tours de suite,
// et deux demi-mains successives se partagent un tour.
export function defaultHands(halves: number[]): HandPlan[] {
  const hands: HandPlan[] = [];
  let waiting: number | null = null;
  halves.forEach((h, i) => {
    if (h === 2) hands.push([i]);
    else if (h === 4) hands.push([i], [i]);
    else if (waiting === null) {
      waiting = hands.length;
      hands.push([i]);
    } else {
      hands[waiting].push(i);
      waiting = null;
    }
  });
  return hands;
}

// Vérifie qu'un plan de mains respecte les parts de chacun. Renvoie un message d'erreur, ou null.
export function checkHands(halves: number[], hands: HandPlan[]): string | null {
  if (halves.some((h) => !SHARE_HALVES.includes(h as ShareHalves))) return "Part invalide : demi-main, main entière ou double main.";
  const held = halves.map(() => 0);
  for (const hand of hands) {
    if (hand.some((i) => !Number.isInteger(i) || i < 0 || i >= halves.length)) return "Main invalide.";
    if (hand.length === 1) {
      if (halves[hand[0]] === 1) return "Une demi-main doit être partagée avec un autre membre en demi-main.";
      held[hand[0]] += 2;
    } else if (hand.length === 2) {
      if (hand[0] === hand[1] || halves[hand[0]] !== 1 || halves[hand[1]] !== 1) {
        return "Une main partagée réunit deux membres différents, chacun en demi-main.";
      }
      held[hand[0]] += 1;
      held[hand[1]] += 1;
    } else return "Une main a un ou deux titulaires.";
  }
  const wrong = held.findIndex((h, i) => h !== halves[i]);
  if (wrong >= 0) return "Chaque membre doit tenir exactement sa part : vérifiez l'ordre des tours.";
  return null;
}

export const totalHalves = (halves: number[]) => halves.reduce((s, h) => s + h, 0);

// Cotisation d'un membre par tour, selon sa part.
export const contributionFor = (amountXof: number, halves: number) => (amountXof * halves) / 2;

export const shareLabel = (halves: number) => (halves === 1 ? "½" : halves === 4 ? "×2" : "");
