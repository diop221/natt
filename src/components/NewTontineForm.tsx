"use client";

import { Gavel, HeartHandshake, PiggyBank, Repeat, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDict } from "@/components/I18n";
import { NETWORKS } from "@/lib/format";
import { type HandPlan, SHARE_HALVES, checkHands, defaultHands, shareLabel, totalHalves } from "@/lib/hands";
import { tf } from "@/lib/i18n/tf";
import { formatXof } from "@/lib/money";

export type MemberInput = { name: string; phone: string; network: string; sponsorPhone: string; halves?: number };
type TontineType = "ROTATING" | "AUCTION" | "SAVINGS" | "SOLIDARITY";
const TYPES: TontineType[] = ["ROTATING", "AUCTION", "SAVINGS", "SOLIDARITY"];

const emptyMember = (): MemberInput => ({ name: "", phone: "", network: "wave", sponsorPhone: "", halves: 2 });
const input = "input w-full";
const TYPE_ICONS = { ROTATING: Repeat, AUCTION: Gavel, SAVINGS: PiggyBank, SOLIDARITY: HeartHandshake };

// Titre d'une étape du formulaire.
function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent">
        {n}
      </span>
      <div className="space-y-0.5">
        <h2 className="text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

type OfferInput = { id: string; title: string; merchant: string; nattPriceXof: number };

export function NewTontineForm({
  me,
  orgs,
  feePct,
  offer,
}: {
  me: MemberInput;
  orgs: { id: string; name: string }[];
  feePct: number;
  offer?: OfferInput | null;
}) {
  const t = useDict();
  const router = useRouter();
  // Tontine d'achat : par défaut une épargne sur 10 mois, au montant qui couvre le prix Natt.
  const [type, setType] = useState<TontineType>(offer ? "SAVINGS" : "ROTATING");
  const [name, setName] = useState(offer?.title ?? "");
  const [amountXof, setAmountXof] = useState(offer ? Math.ceil(offer.nattPriceXof / 10 / 100) * 100 : 10_000);
  const [frequency, setFrequency] = useState("monthly");
  const [totalRounds, setTotalRounds] = useState(10);
  const [goalLabel, setGoalLabel] = useState(offer ? `${offer.title} · ${offer.merchant}` : "");
  const [orderMode, setOrderMode] = useState("MANUAL");
  const [latePenaltyXof, setLatePenaltyXof] = useState(0);
  const [guaranteePct, setGuaranteePct] = useState(0);
  const [orgId, setOrgId] = useState("");
  const [verifyPayouts, setVerifyPayouts] = useState(true);
  const [reservePct, setReservePct] = useState(0);
  // Ordre des tours modifié à la main ; revient à l'ordre par défaut dès que la liste ou les parts changent.
  const [listVersion, setListVersion] = useState(0);
  const [customHands, setCustomHands] = useState<{ key: string; hands: HandPlan[] } | null>(null);
  const [members, setMembers] = useState<MemberInput[]>([me, emptyMember(), emptyMember()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const turns = type === "ROTATING" || type === "AUCTION";
  const rotating = type === "ROTATING";
  const halves = members.map((m) => (rotating ? (m.halves ?? 2) : 2));
  const planKey = `${listVersion}:${halves.join(",")}`;
  const hands = customHands?.key === planKey ? customHands.hands : defaultHands(halves);
  const handsError = rotating ? checkHands(halves, hands) : null;
  const pot = (amountXof * totalHalves(halves)) / 2;
  const memberLabel = (i: number) => members[i].name || `#${i + 1}`;

  const moveHand = (i: number, dir: -1 | 1) => {
    const next = [...hands];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    setCustomHands({ key: planKey, hands: next });
  };

  const updateMember = (i: number, patch: Partial<MemberInput>) => setMembers((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  const move = (i: number, dir: -1 | 1) => {
    setListVersion((v) => v + 1);
    setMembers((ms) => {
      const next = [...ms];
      [next[i], next[i + dir]] = [next[i + dir], next[i]];
      return next;
    });
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/tontines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        type,
        amountXof,
        frequency,
        orderMode: type === "ROTATING" ? orderMode : "MANUAL",
        latePenaltyXof,
        guaranteePct: type === "SOLIDARITY" ? 0 : guaranteePct,
        totalRounds: turns ? undefined : totalRounds,
        goalLabel: type === "SAVINGS" ? goalLabel : undefined,
        orgId: orgId || undefined,
        verifyPayouts,
        reservePct: turns ? reservePct : 0,
        members: members.map((m, i) => ({ ...m, halves: halves[i] })),
        hands: rotating ? hands : undefined,
        offerId: offer?.id,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? t.common.error);
      setSaving(false);
      return;
    }
    router.push(`/tontines/${json.id}`);
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-1">
        <p className="eyebrow inline-flex items-center gap-1.5">
          <Zap size={13} className="fill-current" /> Lightning
        </p>
        <h1 className="text-3xl font-bold tracking-tight">{t.create.title}</h1>
      </div>
      {offer && (
        <div className="rounded-xl bg-accent-soft p-4 text-sm">
          <p className="font-medium text-accent">
            {tf(t.purchase.banner, { offer: offer.title, merchant: offer.merchant, price: formatXof(offer.nattPriceXof) })}
          </p>
          <p className="text-muted">{t.purchase.bannerHelp}</p>
        </div>
      )}

      <fieldset className="card space-y-4 p-6">
        <legend className="sr-only">{t.create.type}</legend>
        <Step n={1} title={t.create.type} />
        <div className="grid gap-3 sm:grid-cols-2">
          {TYPES.filter((x) => !offer || x === "ROTATING" || x === "SAVINGS").map((x) => (
            <label
              key={x}
              className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition ${type === x ? "border-accent bg-accent-soft ring-2 ring-accent/20" : "border-border bg-surface-2/50 hover:border-accent/50"}`}
            >
              <input type="radio" name="type" value={x} checked={type === x} onChange={() => setType(x)} className="sr-only" />
              {(() => {
                const Icon = TYPE_ICONS[x];
                return (
                  <span
                    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${type === x ? "bg-accent text-black" : "bg-surface text-accent"}`}
                  >
                    <Icon size={19} />
                  </span>
                );
              })()}
              <span>
                <span className="block font-semibold">{t.types[x]}</span>
                <span className="block text-sm text-muted">{t.typeHelp[x]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <section className="card grid gap-4 p-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Step n={2} title={t.create.basics} />
        </div>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">{t.create.name}</span>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder={t.create.namePlaceholder} required />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">{t.create.amount}</span>
          <input
            className={input}
            type="number"
            min={100}
            step={100}
            value={amountXof}
            onChange={(e) => setAmountXof(Number(e.target.value))}
            required
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">{t.create.frequency}</span>
          <select className={input} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            <option value="weekly">{t.common.weekly}</option>
            <option value="monthly">{t.common.monthly}</option>
          </select>
        </label>
        {!turns && (
          <label className="space-y-1">
            <span className="text-sm font-medium">{t.create.periods}</span>
            <input
              className={input}
              type="number"
              min={1}
              max={60}
              value={totalRounds}
              onChange={(e) => setTotalRounds(Number(e.target.value))}
              required
            />
          </label>
        )}
        {type === "SAVINGS" && (
          <label className="space-y-1">
            <span className="text-sm font-medium">{t.create.goal}</span>
            <input
              className={input}
              value={goalLabel}
              onChange={(e) => setGoalLabel(e.target.value)}
              placeholder={t.create.goalPlaceholder}
            />
          </label>
        )}
        {type === "ROTATING" && (
          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">{t.create.order}</span>
            <select className={input} value={orderMode} onChange={(e) => setOrderMode(e.target.value)}>
              <option value="MANUAL">{t.create.orderManual}</option>
              <option value="DRAW">{t.create.orderDraw}</option>
            </select>
          </label>
        )}
        {orgs.length > 0 && (
          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">{t.create.org}</span>
            <select className={input} value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              <option value="">{t.create.noOrg}</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      <section className="card space-y-4 p-6">
        <Step n={3} title={t.create.rules} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium">{t.create.penalty}</span>
            <input
              className={input}
              type="number"
              min={0}
              step={100}
              value={latePenaltyXof}
              onChange={(e) => setLatePenaltyXof(Number(e.target.value))}
            />
          </label>
          {type !== "SOLIDARITY" && (
            <label className="space-y-1">
              <span className="text-sm font-medium">{t.create.guarantee}</span>
              <input
                className={input}
                type="number"
                min={0}
                max={50}
                step={0.5}
                value={guaranteePct}
                onChange={(e) => setGuaranteePct(Number(e.target.value))}
              />
            </label>
          )}
        </div>
        {type !== "SOLIDARITY" && <p className="text-sm text-muted">{t.create.guaranteeHelp}</p>}
        {turns && !offer && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-medium">{t.create.reserve}</span>
              <input
                className={input}
                type="number"
                min={0}
                max={10}
                step={0.5}
                value={reservePct}
                onChange={(e) => setReservePct(Number(e.target.value))}
              />
            </label>
            <p className="text-sm text-muted sm:self-end">{t.create.reserveHelp}</p>
          </div>
        )}
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={verifyPayouts} onChange={(e) => setVerifyPayouts(e.target.checked)} className="mt-1" />
          <span>
            <span className="block text-sm font-medium">{t.create.verifyPayouts}</span>
            <span className="block text-sm text-muted">{t.create.verifyPayoutsHelp}</span>
          </span>
        </label>
        <p className="text-sm text-muted">{tf(t.create.fee, { fee: feePct.toLocaleString("fr-FR") })}</p>
      </section>

      <section className="card space-y-4 p-6">
        <div>
          <Step n={4} title={turns && !rotating && orderMode === "MANUAL" ? t.create.membersOrdered : t.create.membersTitle} />
          <p className="text-sm text-muted">{t.create.membersHelp}</p>
          {rotating && <p className="text-sm text-muted">{t.create.sharesHelp}</p>}
        </div>
        <ol className="space-y-3">
          {members.map((m, i) => (
            <li key={i} className="grid grid-cols-[auto_1fr] gap-3 card p-3">
              <span className="pt-2 font-mono text-sm text-muted">{i + 1}</span>
              <div className="grid gap-2 sm:grid-cols-3">
                <input
                  className={input}
                  placeholder={t.create.memberName}
                  value={m.name}
                  onChange={(e) => updateMember(i, { name: e.target.value })}
                  required
                />
                <input
                  className={input}
                  type="tel"
                  placeholder="+221 77 123 45 67"
                  value={m.phone}
                  onChange={(e) => updateMember(i, { phone: e.target.value })}
                  required
                />
                <select className={input} value={m.network} onChange={(e) => updateMember(i, { network: e.target.value })}>
                  {Object.entries(NETWORKS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                {rotating && !offer && (
                  <label className="flex items-center gap-2 text-sm sm:col-span-3">
                    <span className="text-muted">{t.create.share}</span>
                    <select className="input" value={m.halves ?? 2} onChange={(e) => updateMember(i, { halves: Number(e.target.value) })}>
                      {SHARE_HALVES.map((h) => (
                        <option key={h} value={h}>
                          {t.create.shares[String(h) as "1" | "2" | "4"]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <input
                  className={`${input} sm:col-span-3`}
                  type="tel"
                  placeholder={t.create.sponsor}
                  value={m.sponsorPhone}
                  onChange={(e) => updateMember(i, { sponsorPhone: e.target.value })}
                />
                <div className="flex gap-3 text-sm text-muted sm:col-span-3">
                  <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="disabled:opacity-30">
                    {t.create.up}
                  </button>
                  <button type="button" disabled={i === members.length - 1} onClick={() => move(i, 1)} className="disabled:opacity-30">
                    {t.create.down}
                  </button>
                  <button
                    type="button"
                    disabled={members.length <= 2}
                    onClick={() => {
                      setListVersion((v) => v + 1);
                      setMembers((ms) => ms.filter((_, j) => j !== i));
                    }}
                    className="ml-auto text-danger disabled:opacity-30"
                  >
                    {t.create.remove}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => setMembers((ms) => [...ms, emptyMember()])} className="link">
          {t.create.addMember}
        </button>
      </section>

      {rotating && (
        <section className="card space-y-4 p-6">
          <div>
            <Step n={5} title={t.create.turnsTitle} />
            <p className="text-sm text-muted">
              {orderMode === "DRAW" ? t.create.orderDraw : t.create.turnsHelp} ·{" "}
              {tf(t.create.recap, { turns: hands.length, pot: formatXof(pot) })}
            </p>
          </div>
          {handsError ? (
            <p className="text-sm text-danger">{halves.filter((h) => h === 1).length % 2 ? t.create.turnsError : handsError}</p>
          ) : (
            <ol className="divide-y divide-border card">
              {hands.map((hand, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <span>
                    <span className="mr-2 font-mono text-muted">{tf(t.create.turn, { n: i + 1 })}</span>
                    {hand
                      .map((m) => `${memberLabel(m)}${hand.length > 1 ? " ½" : shareLabel(halves[m]) ? ` (${shareLabel(halves[m])})` : ""}`)
                      .join(" + ")}
                  </span>
                  {orderMode === "MANUAL" && (
                    <span className="flex gap-3 text-muted">
                      <button type="button" disabled={i === 0} onClick={() => moveHand(i, -1)} className="disabled:opacity-30">
                        {t.create.up}
                      </button>
                      <button
                        type="button"
                        disabled={i === hands.length - 1}
                        onClick={() => moveHand(i, 1)}
                        className="disabled:opacity-30"
                      >
                        {t.create.down}
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {error && <p className="text-danger">{error}</p>}
      <button disabled={saving || !!handsError} className="btn btn-lg w-full sm:w-auto">
        <Zap size={18} className="fill-current" />
        {saving ? t.create.submitting : t.create.submit}
      </button>
    </form>
  );
}
