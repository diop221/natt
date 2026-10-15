import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Test d'intégration contre la vraie API Bitnob en SANDBOX.
// Lancé seulement à la demande : RUN_BITNOB_SANDBOX=1 npx vitest run tests/bitnob.sandbox.test.ts
// Les clés sont lues dans .env ; le test s'arrête si elles ne sont pas des clés sandbox.

const enabled = process.env.RUN_BITNOB_SANDBOX === "1";

describe.skipIf(!enabled)("Bitnob sandbox", () => {
  it("émet et suit les factures Lightning d'un tour", async () => {
    for (const line of readFileSync(".env", "utf8").split("\n")) {
      const m = line.match(/^(BITNOB_CLIENT_ID|BITNOB_CLIENT_SECRET)=["']?(.*?)["']?\s*$/);
      if (m) process.env[m[1]] = m[2];
    }
    process.env.PAYMENT_PROVIDER = "bitnob";
    process.env.BITNOB_ALLOW_LIVE = "false"; // le garde-fou refuse les clés de production

    const { db } = await import("@/lib/db");
    const { createTontine, syncTontine } = await import("@/lib/tontine");
    const owner = await db.user.create({ data: { name: "Sandbox", phone: `+2217${Date.now().toString().slice(-8)}`, passwordHash: "x" } });
    const t = await createTontine(owner.id, {
      name: "Sandbox Natt",
      type: "ROTATING",
      amountXof: 500,
      frequency: "monthly",
      members: [
        { name: "A", phone: "+221770000101", network: "wave" },
        { name: "B", phone: "+221770000102", network: "orange_money" },
      ],
      orderMode: "MANUAL",
      latePenaltyXof: 0,
      guaranteeBps: 0,
    });
    await syncTontine(t.id);
    const contributions = await db.contribution.findMany({ where: { round: { tontineId: t.id } } });
    expect(contributions).toHaveLength(2);
    for (const c of contributions) {
      expect(c.paymentRequest).toMatch(/^lntb/); // facture du réseau de test
      expect(c.status).toBe("pending");
      expect(c.sats).toBeGreaterThan(0);
    }
    console.log("sats par cotisation de 500 FCFA :", contributions[0].sats);
  });
});
