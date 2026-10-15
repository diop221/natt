import { createHash } from "node:crypto";

// Blocs Bitcoin pour le tirage au sort vérifiable : l'ordre de passage dépend du hash
// d'un bloc qui n'existait pas encore quand la tontine a été créée.

export interface ChainProvider {
  tipHeight(): Promise<number>;
  blockHash(height: number): Promise<string | null>; // null : bloc pas encore miné
}

const mempool: ChainProvider = {
  async tipHeight() {
    const res = await fetch("https://mempool.space/api/blocks/tip/height", { cache: "no-store" });
    if (!res.ok) throw new Error(`mempool.space HTTP ${res.status}`);
    return Number(await res.text());
  },
  async blockHash(height) {
    const res = await fetch(`https://mempool.space/api/block-height/${height}`, { cache: "no-store" });
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new Error(`mempool.space HTTP ${res.status}`);
    return (await res.text()).trim();
  },
};

// Simulation : le bloc « suivant » est disponible tout de suite.
const mock: ChainProvider = {
  async tipHeight() {
    return 900_000;
  },
  async blockHash(height) {
    return createHash("sha256").update(`natt-mock-block-${height}`).digest("hex");
  },
};

export const getChain = (): ChainProvider =>
  (process.env.CHAIN_PROVIDER ?? (process.env.PAYMENT_PROVIDER === "bitnob" ? "mempool" : "mock")) === "mempool"
    ? mempool
    : mock;

// Ordre du tirage : les membres sont triés selon sha256(hash du bloc + ":" + identifiant du membre).
// N'importe qui peut refaire le calcul à partir des données publiées.
export function drawOrder<T extends { id: string }>(blockHash: string, members: T[]) {
  const key = (m: T) => createHash("sha256").update(`${blockHash}:${m.id}`).digest("hex");
  return [...members].map((m) => ({ m, k: key(m) })).sort((a, b) => a.k.localeCompare(b.k)).map(({ m, k }) => ({ ...m, drawKey: k }));
}
