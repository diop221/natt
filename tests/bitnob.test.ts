import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as webhook } from "@/app/api/webhooks/bitnob/route";
import { db } from "@/lib/db";
import { bitnobProvider } from "@/lib/payments/bitnob";
import { mockProvider, simulateMockPayment } from "@/lib/payments/mock";
import { checkProcessingPayouts, syncTontine } from "@/lib/tontine";
import { currentRound, newTontine, pay } from "./helpers";

// Intégration Bitnob, vérifiée contre la documentation Code & Chain et la sandbox (15/10/2026) :
// réponses des payouts dans data.payout, étapes suivantes par quote_id, règlement confirmé plus tard.

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("client Bitnob", () => {
  it("enchaîne cotation → initialisation → finalisation avec le quote_id et le corridor sénégalais", async () => {
    vi.stubEnv("BITNOB_CLIENT_ID", "client");
    vi.stubEnv("BITNOB_CLIENT_SECRET", "secret");
    vi.stubEnv("APP_URL", "https://natt.example");
    const calls: { method: string; path: string; body: Record<string, unknown> | null }[] = [];
    const reply = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const path = new URL(url).pathname;
        calls.push({ method: init.method ?? "GET", path, body: init.body ? JSON.parse(String(init.body)) : null });
        if (path === "/api/whoami") return reply({ environment: "sandbox" });
        if (path === "/api/payouts/quotes") return reply({ payout: { id: "uuid-1", quote_id: "QT2_1", status: "QUOTE" } });
        if (path.endsWith("/initialize")) return reply({ payout: { id: "uuid-1", quote_id: "QT2_1", status: "INITIATED" } });
        if (path.endsWith("/finalize")) return reply({ payout: { id: "uuid-1", quote_id: "QT2_1", status: "PENDING" } });
        if (path === "/api/payouts/uuid-1") return reply({ payout: { id: "uuid-1", quote_id: "QT2_1", status: "COMPLETED" } });
        return new Response("{}", { status: 404 });
      }),
    );

    const result = await bitnobProvider.payout({
      amountXof: 29_700,
      reference: "natt-test",
      beneficiary: { name: "Awa Ndiaye", phone: "+221770000001", network: "orange_money" },
    });
    expect(result).toEqual({ id: "uuid-1", status: "PENDING" });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /api/whoami",
      "POST /api/payouts/quotes",
      "POST /api/payouts/QT2_1/initialize",
      "POST /api/payouts/QT2_1/finalize",
    ]);
    expect(calls[1].body).toMatchObject({ settlement_amount: "29700", from_asset: "BTC", to_currency: "XOF", country: "SN", source: "offchain" });
    expect(calls[2].body).toMatchObject({
      quote_id: "QT2_1",
      callback_url: "https://natt.example/api/webhooks/bitnob",
      beneficiary: { destination_type: "mobile_money", network: "orange", account_number: "221770000001", country: "SN" },
    });
    expect(await bitnobProvider.getPayoutStatus("uuid-1")).toBe("paid");
  });
});

describe("versement en cours de règlement", () => {
  it("attend la confirmation de l'opérateur avant de marquer payé et de passer au tour suivant", async () => {
    vi.spyOn(mockProvider, "payout").mockResolvedValue({ id: "prov-1", status: "PENDING" });
    const status = vi.spyOn(mockProvider, "getPayoutStatus").mockResolvedValue("pending");
    const t = await newTontine();
    await pay(t.id);
    await syncTontine(t.id);

    const r1 = await db.round.findFirstOrThrow({ where: { tontineId: t.id, number: 1 }, include: { payouts: true } });
    expect(r1.status).toBe("PAYING_OUT");
    expect(r1.payouts[0]).toMatchObject({ status: "PROCESSING", providerId: "prov-1", paidAt: null });
    expect(await db.notification.count({ where: { key: { startsWith: "payout:" } } })).toBe(0);

    status.mockResolvedValue("paid");
    await syncTontine(t.id);
    expect(await db.payout.findFirstOrThrow({ where: { roundId: r1.id } })).toMatchObject({ status: "PAID" });
    expect(await db.notification.count({ where: { key: { startsWith: "payout:" } } })).toBe(1);
    expect((await currentRound(t.id)).number).toBe(2);
  });

  it("signale un versement refusé par l'opérateur sans le relancer tout seul", async () => {
    const send = vi.spyOn(mockProvider, "payout").mockResolvedValue({ id: "prov-2", status: "PENDING" });
    vi.spyOn(mockProvider, "getPayoutStatus").mockResolvedValue("failed");
    const t = await newTontine();
    await pay(t.id);
    await syncTontine(t.id);
    await checkProcessingPayouts();
    await syncTontine(t.id);

    const r1 = await db.round.findFirstOrThrow({ where: { tontineId: t.id, number: 1 }, include: { payouts: true } });
    expect(r1.status).toBe("PAYOUT_FAILED");
    expect(r1.payouts[0]).toMatchObject({ status: "FAILED", error: expect.stringContaining("opérateur") });
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("webhook Bitnob", () => {
  const sign = (body: string) => createHmac("sha512", "whsec").update(body).digest("hex");
  const post = (body: string, signature: string) =>
    webhook(new Request("http://localhost/api/webhooks/bitnob", { method: "POST", body, headers: { "x-bitnob-signature": signature } }));

  it("refuse une signature invalide et confirme une cotisation sur transfer.success", async () => {
    vi.stubEnv("BITNOB_WEBHOOK_SECRET", "whsec");
    const t = await newTontine();
    const c = (await currentRound(t.id)).contributions[0];
    const body = JSON.stringify({ event: "transfer.success", event_id: "e1", data: { invoice: c.paymentRequest, chain: "lightning" } });

    expect((await post(body, sign(body + "x"))).status).toBe(401);
    await simulateMockPayment(c.invoiceId!);
    expect((await post(body, sign(body))).status).toBe(200);
    expect((await db.contribution.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("paid");
    // Relance du même événement : rien ne change.
    expect((await post(body, sign(body))).status).toBe(200);
  });
});
