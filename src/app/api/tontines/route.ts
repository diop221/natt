import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkHands, defaultHands, totalHalves } from "@/lib/hands";
import { MAX_PAYOUT_XOF, formatXof } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";
import { NattError, TONTINE_TYPES, createTontine, hasTurns } from "@/lib/tontine";
import { inviteAll } from "@/lib/verification";

const phone = z
  .string()
  .transform((v) => normalizePhone(v))
  .refine((v): v is string => v !== null, "Numéro de téléphone invalide");

const schema = z
  .object({
    name: z.string().trim().min(1).max(80),
    type: z.enum(TONTINE_TYPES),
    amountXof: z.number().int().min(100).max(10_000_000),
    frequency: z.enum(["weekly", "monthly"]),
    orderMode: z.enum(["MANUAL", "DRAW"]),
    latePenaltyXof: z.number().int().min(0).max(1_000_000),
    guaranteePct: z.number().min(0).max(50),
    totalRounds: z.number().int().min(1).max(60).optional(),
    goalLabel: z.string().trim().max(60).optional(),
    orgId: z.string().optional(),
    verifyPayouts: z.boolean().default(true),
    reservePct: z.number().min(0).max(10).default(0),
    offerId: z.string().optional(),
    // Tontine classique : ordre des tours, chaque main donnant les indices de ses titulaires.
    hands: z.array(z.array(z.number().int().min(0)).min(1).max(2)).optional(),
    members: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(60),
          phone,
          network: z.enum(["wave", "orange_money", "free_money", "expresso"]),
          sponsorPhone: z.union([z.literal(""), phone]).optional(),
          halves: z.union([z.literal(1), z.literal(2), z.literal(4)]).default(2),
        }),
      )
      .min(2)
      .max(50)
      .refine((ms) => new Set(ms.map((m) => m.phone)).size === ms.length, "Deux membres ont le même numéro"),
  })
  .refine((d) => hasTurns(d.type) || d.totalRounds, { message: "Indiquez le nombre de périodes", path: ["totalRounds"] })
  .refine((d) => d.type === "ROTATING" || d.members.every((m) => m.halves === 2), {
    message: "Les demi-mains et doubles mains ne concernent que les tontines classiques.",
  })
  .superRefine((d, ctx) => {
    if (d.type !== "ROTATING") return;
    const halves = d.members.map((m) => m.halves);
    const error = checkHands(halves, d.hands ?? defaultHands(halves));
    if (error) ctx.addIssue({ code: "custom", message: error, path: ["hands"] });
  })
  // Un versement mobile money ne peut pas dépasser la limite de Bitnob.
  .refine(
    (d) =>
      d.type === "SOLIDARITY" ||
      d.amountXof *
        (d.type === "ROTATING" ? totalHalves(d.members.map((m) => m.halves)) / 2 : hasTurns(d.type) ? d.members.length : (d.totalRounds ?? 1)) *
        (1 + d.guaranteePct / 100) <=
        MAX_PAYOUT_XOF,
    { message: `Un versement ne peut pas dépasser ${formatXof(MAX_PAYOUT_XOF)} (limite Bitnob). Réduisez la cotisation, le nombre de membres ou de périodes.` },
  );

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Connectez-vous" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Données invalides" }, { status: 400 });
  }
  const { guaranteePct, reservePct, orgId, ...data } = parsed.data;
  // On ne rattache une tontine qu'à une association dont on fait partie du bureau.
  if (orgId && !(await db.orgMember.findFirst({ where: { orgId, userId: user.id, role: "ADMIN" } }))) {
    return NextResponse.json({ error: "Association introuvable" }, { status: 403 });
  }
  try {
    const tontine = await createTontine(user.id, {
      ...data,
      orgId: orgId || null,
      guaranteeBps: Math.round(guaranteePct * 100),
      reserveBps: Math.round(reservePct * 100),
      members: data.members.map((m) => ({ ...m, sponsorPhone: m.sponsorPhone || null })),
    });
    if (tontine.verifyPayouts) await inviteAll(tontine.id, user.id);
    return NextResponse.json({ id: tontine.id }, { status: 201 });
  } catch (err) {
    const message = err instanceof NattError ? err.message : `Erreur : ${err instanceof Error ? err.message : err}`;
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
