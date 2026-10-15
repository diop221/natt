import { Building2, CalendarClock, Coins, ShieldCheck, Target, Users, Zap } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { Avatar } from "@/components/Brand";
import { AutoSync } from "@/components/AutoSync";
import { CopyButton } from "@/components/CopyButton";
import { StatusBadge } from "@/components/StatusBadge";
import { SyncError } from "@/components/SyncError";
import { canManageTontine, canViewTontine } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { NETWORKS, formatDate } from "@/lib/format";
import { shareLabel, totalHalves } from "@/lib/hands";
import { getDict, getLocale, tf } from "@/lib/i18n";
import { formatXof, xofToSats } from "@/lib/money";
import { isMockProvider } from "@/lib/payments";
import { type Reliability, reliability } from "@/lib/score";
import { getTontine, hasTurns, syncTontine } from "@/lib/tontine";
import {
  bidAction,
  confirmAction,
  coverAction,
  decideAction,
  editPaymentAction,
  inviteAction,
  remindAction,
  requestAction,
  retryAction,
  simulatePayAction,
  swapAnswerAction,
  swapCancelAction,
  swapDecideAction,
  swapRequestAction,
  voiceAction,
} from "./actions";
import { AnnounceSection, IncidentsSection, PurchaseSection, ReserveSection } from "./sections";

export const dynamic = "force-dynamic";

const card = "card space-y-3 p-5";
const input = "input";
const button = "btn";
const link = "link";

export default async function TontinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/tontines/${id}`);
  if (!(await canViewTontine(user.id, id))) notFound();

  const syncError = await syncTontine(id).then(
    () => null,
    (err) => `Synchronisation impossible : ${err instanceof Error ? err.message : err}`,
  );
  const [tontine, t, locale, manage] = await Promise.all([getTontine(id), getDict(), getLocale(), canManageTontine(user.id, id)]);
  if (!tontine) notFound();

  const now = new Date();
  const mock = isMockProvider();
  const turns = hasTurns(tontine.type);
  const isOwner = tontine.ownerId === user.id;
  const me = tontine.members.find((m) => m.userId === user.id);
  const current = tontine.rounds.find((r) => r.number === tontine.currentRound);
  const late = current ? now >= current.dueAt : false;
  const rotating = tontine.type === "ROTATING";
  const pot = rotating
    ? (tontine.amountXof * totalHalves(tontine.members.map((m) => m.halves))) / 2
    : tontine.amountXof * tontine.members.length;
  // Tontine classique : la main du tour en cours (une demi-main partagée a deux titulaires).
  const currentHand = rotating ? tontine.hands.find((h) => h.position === tontine.currentRound) : undefined;
  const handNames = (h: (typeof tontine.hands)[number]) =>
    h.holders.map((x) => (h.holders.length > 1 ? `${x.member.name} ½` : x.member.name)).join(" + ");
  const done = tontine.rounds.filter((r) => r.status === "DONE");
  const paidNow = current?.contributions.filter((c) => c.status !== "pending").length ?? 0;
  const potSats = await xofToSats(turns ? pot : tontine.amountXof * tontine.totalRounds).catch(() => null);
  const scores = new Map<string, Reliability>(
    await Promise.all(tontine.members.filter((m) => m.userId).map(async (m) => [m.id, await reliability(m.userId!)] as const)),
  );
  const date = (d: Date) => formatDate(d, locale);
  const dateTime = (d: Date) => d.toLocaleString(locale === "wo" ? "fr-SN" : "fr-FR", { dateStyle: "short", timeStyle: "short" });

  // Échange de tours : seulement les tours pas encore versés (le tour en cours, tant que la collecte dure).
  const canSwapTurns = tontine.type === "ROTATING" && tontine.status === "ACTIVE";
  const swappable = (position: number) =>
    position > tontine.currentRound || (position === tontine.currentRound && current?.status === "COLLECTING");
  const pendingSwaps = tontine.swaps.filter((s) => s.status === "PENDING_PARTNER" || s.status === "PENDING_ORGANIZER");
  const busy = new Set(pendingSwaps.flatMap((s) => [s.requesterHandId, s.partnerHandId]));
  const soleHands = tontine.hands.filter((h) => h.holders.length === 1 && swappable(h.position) && !busy.has(h.id));
  const myHands = soleHands.filter((h) => h.holders[0].memberId === me?.id);
  const otherHands = soleHands.filter((h) => h.holders[0].memberId !== me?.id);

  const roundTitle = !current
    ? ""
    : rotating && currentHand
      ? tf(t.tontine.roundFor, { n: current.number, total: tontine.totalRounds, name: handNames(currentHand) })
      : tontine.type === "AUCTION"
        ? current.beneficiary
          ? tf(t.tontine.roundFor, { n: current.number, total: tontine.totalRounds, name: current.beneficiary.name })
          : tf(t.tontine.roundAuction, { n: current.number, total: tontine.totalRounds })
        : tf(t.tontine.roundPeriod, { n: current.number, total: tontine.totalRounds });

  return (
    <div className="space-y-6">
      <AutoSync active={tontine.status !== "COMPLETED"} />
      <SyncError message={syncError} />

      <section className="card relative overflow-hidden p-6 sm:p-8">
        <div className="glow pointer-events-none absolute -top-32 -right-24 h-80 w-80" />
        <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge badge-accent">{t.types[tontine.type as keyof typeof t.types]}</span>
              <span className="badge">
                <Zap size={11} className="fill-current text-accent" /> Lightning
              </span>
              {tontine.verifyPayouts && (
                <span className="badge">
                  <ShieldCheck size={12} className="text-success" /> {t.tontine.verifiedPayouts}
                </span>
              )}
              {tontine.org && (
                <Link href={`/organisations/${tontine.org.id}`} className="badge hover:text-foreground">
                  <Building2 size={12} /> {tontine.org.name}
                </Link>
              )}
            </div>
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{tontine.name}</h1>
              <p className="text-sm text-muted">
                {isOwner ? t.tontine.organizedByYou : tf(t.tontine.organizedBy, { name: tontine.owner.name })}
              </p>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Users size={15} /> {tontine.members.length} {t.common.members}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Coins size={15} /> {tf(t.tontine.perMember, { amount: formatXof(tontine.amountXof) })}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock size={15} /> {tontine.frequency === "weekly" ? t.common.weekly : t.common.monthly}
              </span>
              {tontine.goalLabel && (
                <span className="inline-flex items-center gap-1.5">
                  <Target size={15} /> {tontine.goalLabel}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-5 rounded-2xl border border-border bg-surface-2/60 p-5">
            {current && tontine.status === "ACTIVE" && (
              <Ring value={paidNow} total={current.contributions.length} label={t.tontine.roundPaid} />
            )}
            <div>
              <p className="text-xs text-muted">{turns ? t.tontine.potLabel : t.tontine.savingsLabel}</p>
              <p className="text-3xl font-extrabold tracking-tight">{formatXof(turns ? pot : tontine.amountXof * tontine.totalRounds)}</p>
              {potSats !== null && <p className="font-mono text-xs text-accent">≈ {potSats.toLocaleString("fr-FR")} sats</p>}
            </div>
          </div>
        </div>
      </section>

      {tontine.status === "DRAWING" && (
        <p className="rounded-xl bg-warn-soft p-4 text-sm text-warn">
          {tf(t.tontine.drawing, { height: tontine.drawBlockHeight ?? "?" })}{" "}
          <Link href={`/tontines/${tontine.id}/tirage`} className="font-medium underline">
            {t.tontine.drawProof}
          </Link>
        </p>
      )}

      {tontine.status === "COMPLETED" && <p className="rounded-xl bg-accent-soft p-4 font-medium text-accent">{t.tontine.completed}</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          {tontine.status === "ACTIVE" && current && (
            <section className={card}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">{roundTitle}</h2>
                <span className="text-sm text-muted">{t.status[current.status as keyof typeof t.status]}</span>
              </div>
              <RoundProgress
                round={current}
                recipients={currentHand ? currentHand.holders.map((h) => h.member) : current.beneficiary ? [current.beneficiary] : []}
                late={late}
                t={t}
                date={date}
              />

              {(current.status === "PAYOUT_FAILED" || tontine.payouts.some((p) => p.roundId === current.id && p.status === "FAILED")) && (
                <div className="space-y-2 rounded-lg bg-warn-soft p-3 text-sm">
                  {tontine.payouts
                    .filter((p) => p.roundId === current.id && p.status === "FAILED")
                    .map((p) => (
                      <div key={p.id} className="space-y-1">
                        <p className="text-danger">{p.error}</p>
                        {manage ? (
                          <ActionForm action={retryAction}>
                            <input type="hidden" name="payoutId" value={p.id} />
                            <button className={link}>{t.tontine.retry}</button>
                          </ActionForm>
                        ) : (
                          <p className="text-muted">{t.tontine.ownerCanRetry}</p>
                        )}
                      </div>
                    ))}
                </div>
              )}

              <ul className="divide-y divide-border">
                {[...current.contributions]
                  .sort((a, b) => a.member.position - b.member.position)
                  .map((c) => {
                    const status = c.status === "pending" && late ? "late" : c.status;
                    return (
                      <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar name={c.member.name} size={36} />
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">
                                {c.member.name}
                                {c.member.userId === user.id && <span className="text-muted"> ({t.common.you})</span>}
                              </span>
                              <StatusBadge status={status} label={t.status[status as keyof typeof t.status]} />
                            </p>
                            <p className="text-xs text-muted">
                              {formatXof(c.amountXof - c.creditUsedXof + c.guaranteeXof)}
                              {c.sats > 0 && <span className="font-mono"> · {c.sats.toLocaleString("fr-FR")} sats</span>}
                              {c.status === "paid" && c.paidAt && (
                                <span className="text-success">
                                  {" "}
                                  · <Zap size={10} className="inline fill-current" /> {dateTime(c.paidAt)}
                                </span>
                              )}
                            </p>
                          </div>
                          {c.creditUsedXof > 0 && (
                            <span className="text-xs text-muted">{tf(t.tontine.credit, { amount: formatXof(c.creditUsedXof) })}</span>
                          )}
                          {c.sponsorName && (
                            <span className="text-xs text-muted">{tf(t.tontine.sponsoredBy, { name: c.sponsorName })}</span>
                          )}
                        </div>
                        {c.status === "pending" && (
                          <div className="flex flex-wrap items-center gap-4">
                            {c.member.userId === user.id ? (
                              <Link href={`/pay/${c.id}`} className="btn">
                                <Zap size={14} className="fill-current" /> {t.home.payNow}
                              </Link>
                            ) : (
                              <Link href={`/pay/${c.id}`} className={link}>
                                {t.common.invoice}
                              </Link>
                            )}
                            <CopyButton text={`/pay/${c.id}`} label={t.common.copyLink} absolute />
                            {manage && late && tontine.type !== "SOLIDARITY" && tontine.fundXof > 0 && (
                              <ActionForm action={coverAction}>
                                <input type="hidden" name="contributionId" value={c.id} />
                                <button className={link}>{t.tontine.cover}</button>
                              </ActionForm>
                            )}
                            {mock && (
                              <ActionForm action={simulatePayAction}>
                                <input type="hidden" name="id" value={c.id} />
                                <button className="text-sm text-warn">{t.common.simulatePay}</button>
                              </ActionForm>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
              </ul>

              {manage && current.contributions.some((c) => c.status === "pending") && (
                <ActionForm action={remindAction} className="flex flex-wrap items-center gap-3">
                  <input type="hidden" name="tontineId" value={tontine.id} />
                  <button className={link}>{t.tontine.remind}</button>
                </ActionForm>
              )}
            </section>
          )}

          {tontine.type === "AUCTION" && tontine.status === "ACTIVE" && current?.status === "COLLECTING" && (
            <section className={card}>
              <h2 className="font-semibold">{t.auction.title}</h2>
              <p className="text-sm text-muted">{t.auction.help}</p>
              {current.bids.length === 0 ? (
                <p className="text-sm text-muted">{t.auction.none}</p>
              ) : (
                <ol className="space-y-1 text-sm">
                  {current.bids.map((b, i) => (
                    <li key={b.id} className={i === 0 ? "font-semibold" : ""}>
                      {b.member.name} · {formatXof(b.amountXof)}
                    </li>
                  ))}
                </ol>
              )}
              {me &&
                (current.number >= tontine.totalRounds ? (
                  <p className="text-sm text-muted">{t.auction.closedLast}</p>
                ) : done.some((r) => r.beneficiaryId === me.id) ? (
                  <p className="text-sm text-muted">{t.auction.alreadyWon}</p>
                ) : (
                  <ActionForm action={bidAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="roundId" value={current.id} />
                    <label className="space-y-1">
                      <span className="block text-sm">{t.auction.yourBid}</span>
                      <input name="amount" type="number" min={100} step={100} required className={input} />
                    </label>
                    <button className={button}>{t.auction.bid}</button>
                  </ActionForm>
                ))}
            </section>
          )}

          {tontine.type === "SOLIDARITY" && (
            <section className={card}>
              <h2 className="font-semibold">{t.solidarity.title}</h2>
              {tontine.requests.length === 0 ? (
                <p className="text-sm text-muted">{t.solidarity.none}</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {tontine.requests.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        <span className="font-medium">{r.member.name}</span> ·{" "}
                        {t.solidarity.reasons[r.reason as keyof typeof t.solidarity.reasons]} · {r.description} · {formatXof(r.amountXof)}
                      </span>
                      {r.status === "PENDING" && manage ? (
                        <span className="flex gap-3">
                          <ActionForm action={decideAction}>
                            <input type="hidden" name="requestId" value={r.id} />
                            <input type="hidden" name="approve" value="1" />
                            <button className={link}>{t.solidarity.approve}</button>
                          </ActionForm>
                          <ActionForm action={decideAction}>
                            <input type="hidden" name="requestId" value={r.id} />
                            <input type="hidden" name="approve" value="0" />
                            <button className="text-sm text-danger">{t.solidarity.reject}</button>
                          </ActionForm>
                        </span>
                      ) : (
                        <span className="text-muted">{t.solidarity.statuses[r.status as keyof typeof t.solidarity.statuses]}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {me && tontine.status !== "COMPLETED" && (
                <details>
                  <summary className={`${link} cursor-pointer`}>{t.solidarity.new}</summary>
                  <ActionForm action={requestAction} className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input type="hidden" name="tontineId" value={tontine.id} />
                    <label className="space-y-1">
                      <span className="block text-sm">{t.solidarity.reason}</span>
                      <select name="reason" className={`${input} w-full`}>
                        {Object.entries(t.solidarity.reasons).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="block text-sm">{t.solidarity.amount}</span>
                      <input name="amount" type="number" min={100} step={100} required className={`${input} w-full`} />
                    </label>
                    <label className="space-y-1 sm:col-span-2">
                      <span className="block text-sm">{t.solidarity.description}</span>
                      <input name="description" required maxLength={200} className={`${input} w-full`} />
                    </label>
                    <button className={`${button} sm:col-span-2 sm:justify-self-start`}>{t.solidarity.send}</button>
                  </ActionForm>
                </details>
              )}
            </section>
          )}

          {tontine.type === "SAVINGS" && (
            <section className={card}>
              <h2 className="font-semibold">{t.tontine.savings}</h2>
              <ul className="divide-y divide-border text-sm">
                {tontine.members.map((m) => {
                  const saved = tontine.rounds
                    .flatMap((r) => r.contributions)
                    .filter((c) => c.memberId === m.id && c.status !== "pending")
                    .reduce((s, c) => s + c.amountXof, 0);
                  return (
                    <li key={m.id} className="flex justify-between py-2">
                      <span>{m.name}</span>
                      <span className="text-muted">{tf(t.tontine.savingsTotal, { amount: formatXof(saved) })}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {canSwapTurns && (
            <section className={card}>
              <h2 className="font-semibold">{t.swap.title}</h2>
              <p className="text-sm text-muted">{t.swap.help}</p>
              {tontine.swaps.length === 0 ? (
                <p className="text-sm text-muted">{t.swap.none}</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {tontine.swaps.map((sw) => (
                    <li key={sw.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        {tf(t.swap.line, { a: sw.requester.name, from: sw.requesterPosition, b: sw.partner.name, to: sw.partnerPosition })}
                        <span className="block text-xs text-muted">
                          {tf(t.swap.statuses[sw.status as keyof typeof t.swap.statuses], { name: sw.partner.name })} ·{" "}
                          {dateTime(sw.createdAt)}
                        </span>
                      </span>
                      <span className="flex flex-wrap gap-3">
                        {sw.status === "PENDING_PARTNER" && sw.partnerId === me?.id && (
                          <>
                            <ActionForm action={swapAnswerAction}>
                              <input type="hidden" name="swapId" value={sw.id} />
                              <input type="hidden" name="accept" value="1" />
                              <button className={link}>{t.swap.accept}</button>
                            </ActionForm>
                            <ActionForm action={swapAnswerAction}>
                              <input type="hidden" name="swapId" value={sw.id} />
                              <input type="hidden" name="accept" value="0" />
                              <button className="text-sm text-danger">{t.swap.refuse}</button>
                            </ActionForm>
                          </>
                        )}
                        {sw.status === "PENDING_ORGANIZER" && manage && (
                          <>
                            <ActionForm action={swapDecideAction}>
                              <input type="hidden" name="swapId" value={sw.id} />
                              <input type="hidden" name="approve" value="1" />
                              <button className={link}>{t.swap.approve}</button>
                            </ActionForm>
                            <ActionForm action={swapDecideAction}>
                              <input type="hidden" name="swapId" value={sw.id} />
                              <input type="hidden" name="approve" value="0" />
                              <button className="text-sm text-danger">{t.swap.reject}</button>
                            </ActionForm>
                          </>
                        )}
                        {(sw.status === "PENDING_PARTNER" || sw.status === "PENDING_ORGANIZER") && sw.requesterId === me?.id && (
                          <ActionForm action={swapCancelAction}>
                            <input type="hidden" name="swapId" value={sw.id} />
                            <button className="text-sm text-muted underline">{t.swap.cancel}</button>
                          </ActionForm>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {me &&
                (myHands.length > 0 && otherHands.length > 0 ? (
                  <ActionForm action={swapRequestAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="tontineId" value={tontine.id} />
                    {myHands.length === 1 ? (
                      <input type="hidden" name="handId" value={myHands[0].id} />
                    ) : (
                      <label className="space-y-1">
                        <span className="block text-sm">{t.swap.mine}</span>
                        <select name="handId" required className={input}>
                          {myHands.map((h) => (
                            <option key={h.id} value={h.id}>
                              {tf(t.swap.mineOption, { n: h.position })}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="min-w-0 flex-1 space-y-1">
                      <span className="block text-sm">{t.swap.ask}</span>
                      <select name="partnerHandId" required className={`${input} w-full`}>
                        {otherHands.map((h) => (
                          <option key={h.id} value={h.id}>
                            {tf(t.swap.option, { name: h.holders[0].member.name, n: h.position })}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className={button}>{t.swap.send}</button>
                  </ActionForm>
                ) : (
                  <p className="text-sm text-muted">
                    {myHands.length > 0
                      ? t.swap.noPartner
                      : tontine.hands.some((h) => h.holders.length > 1 && h.holders.some((x) => x.memberId === me.id))
                        ? t.swap.shared
                        : t.swap.notEligible}
                  </p>
                ))}
            </section>
          )}

          <PurchaseSection tontine={tontine} t={t} me={me} manage={manage} />
          <IncidentsSection tontine={tontine} t={t} me={me} manage={manage} dateTime={dateTime} />
          {manage && tontine.status !== "COMPLETED" && <AnnounceSection tontineId={tontine.id} t={t} />}

          {tontine.charges.length > 0 && (
            <section className={card}>
              <h2 className="font-semibold">{t.tontine.penalties}</h2>
              <ul className="divide-y divide-border text-sm">
                {tontine.charges.map((ch) => (
                  <li key={ch.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      {ch.member.name} · {ch.kind === "PENALTY" ? t.home.penalty : t.home.repayment} · {formatXof(ch.amountXof)}
                    </span>
                    {ch.status === "paid" ? (
                      <StatusBadge status="paid" label={t.status.paid} />
                    ) : (
                      <span className="flex items-center gap-3">
                        <Link href={`/pay/${ch.id}`} className={link}>
                          {t.tontine.payPenalty}
                        </Link>
                        {mock && (
                          <ActionForm action={simulatePayAction}>
                            <input type="hidden" name="id" value={ch.id} />
                            <button className="text-sm text-warn">{t.common.simulatePay}</button>
                          </ActionForm>
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={card}>
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">{t.tontine.payouts}</h2>
              <a href={`/api/tontines/${tontine.id}/export`} className={link}>
                {t.tontine.export}
              </a>
            </div>
            {tontine.payouts.length === 0 ? (
              <p className="text-sm text-muted">{t.tontine.noPayouts}</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {tontine.payouts.map((p) => (
                  <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      {p.member.name} · {formatXof(p.amountXof)}
                      {p.feeXof > 0 && <span className="text-muted"> · {tf(t.tontine.fee, { amount: formatXof(p.feeXof) })}</span>}
                    </span>
                    <span className={p.status === "FAILED" ? "text-danger" : "text-muted"}>
                      {p.paidAt ? date(p.paidAt) : p.status === "FAILED" ? t.status.PAYOUT_FAILED : t.status.PAYING_OUT}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {tontine.audit.length > 0 && (
            <section className={card}>
              <div>
                <h2 className="font-semibold">{t.journal.title}</h2>
                <p className="text-sm text-muted">{t.journal.help}</p>
              </div>
              <ul className="space-y-1 text-sm">
                {tontine.audit.map((e) => (
                  <li key={e.id} className="flex flex-wrap gap-x-3">
                    <span className="font-mono text-xs text-muted">{dateTime(e.createdAt)}</span>
                    <span>{e.label}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <aside className="min-w-0 space-y-6">
          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">{turns ? t.tontine.order : t.create.membersTitle}</h2>
              {tontine.orderMode === "DRAW" && (
                <Link href={`/tontines/${tontine.id}/tirage`} className={link}>
                  {t.tontine.drawProof}
                </Link>
              )}
            </div>
            {rotating && (
              <>
                <ol className="divide-y divide-border card">
                  {tontine.hands.map((h) => {
                    const won = done.find((r) => r.number === h.position);
                    return (
                      <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                        <span>
                          <span className="mr-2 font-mono text-muted">{h.position}</span>
                          {handNames(h)}
                        </span>
                        <span className="text-muted">
                          {won?.closedAt
                            ? tf(t.tontine.receivedOn, { date: date(won.closedAt) })
                            : h.position === tontine.currentRound && tontine.status === "ACTIVE"
                              ? t.tontine.current
                              : t.tontine.upcoming}
                        </span>
                      </li>
                    );
                  })}
                </ol>
                <h2 className="font-semibold">{t.create.membersTitle}</h2>
              </>
            )}
            <ol className="divide-y divide-border card">
              {tontine.members.map((m) => {
                const won = done.find((r) => r.beneficiaryId === m.id);
                const s = scores.get(m.id);
                return (
                  <li key={m.id} className="space-y-2 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {turns && !rotating && <span className="font-mono text-muted">{m.position}</span>}
                        <span>
                          {m.name}
                          {shareLabel(m.halves) && <span className="font-medium text-accent"> {shareLabel(m.halves)}</span>}{" "}
                          <span className="text-muted">· {NETWORKS[m.network]}</span>
                        </span>
                        {m.voiceNotes && <span className="rounded-full bg-border px-2 py-0.5 text-xs">{t.voice.on}</span>}
                        {m.suspendedAt && <StatusBadge status="late" label={t.incident.suspended} />}
                        {m.transferredAt && <span className="text-xs text-muted">{t.incident.transferred}</span>}
                        {m.reserveXof > 0 && (
                          <span className="text-xs text-muted">{tf(t.reserve.held, { amount: formatXof(m.reserveXof) })}</span>
                        )}
                        {s && (
                          <span className="rounded-full bg-border px-2 py-0.5 text-xs">
                            {s.score === null ? t.tontine.newMember : tf(t.tontine.score, { score: `${s.score}/100` })}
                          </span>
                        )}
                        {(tontine.verifyPayouts || m.verifiedAt) && (
                          <StatusBadge
                            status={m.verifiedVia === "OTP" ? "paid" : m.verifiedVia ? "verified-manual" : "pending"}
                            label={m.verifiedVia === "OTP" ? t.verify.verified : m.verifiedVia ? t.verify.confirmed : t.verify.unverified}
                          />
                        )}
                      </span>
                      {turns && !rotating && (
                        <span className="text-muted">
                          {won?.closedAt
                            ? tf(t.tontine.receivedOn, { date: date(won.closedAt) })
                            : current?.beneficiaryId === m.id && tontine.status === "ACTIVE"
                              ? t.tontine.current
                              : t.tontine.upcoming}
                        </span>
                      )}
                    </div>
                    {m.userId === user.id && (
                      <div className="flex flex-wrap gap-4">
                        {!m.verifiedAt && (
                          <Link href={`/verifier/${m.id}`} className={link}>
                            {t.verify.verifyMine}
                          </Link>
                        )}
                        <VoiceToggle memberId={m.id} on={m.voiceNotes} t={t} />
                      </div>
                    )}
                    {manage && tontine.status !== "COMPLETED" && (
                      <details>
                        <summary className="cursor-pointer text-xs text-muted">
                          {m.phone} · {t.verify.edit}
                          {!m.verifiedAt && ` · ${t.verify.invite}`}
                        </summary>
                        <div className="mt-2 space-y-3 rounded-lg bg-background p-3">
                          {m.userId !== user.id && <VoiceToggle memberId={m.id} on={m.voiceNotes} t={t} />}
                          {(m.emergencyPhone || m.heirPhone) && (
                            <div className="space-y-1 text-xs text-muted">
                              {m.emergencyPhone && (
                                <p>{tf(t.incident.emergency, { name: m.emergencyName ?? "?", phone: m.emergencyPhone })}</p>
                              )}
                              {m.heirPhone && (
                                <p>
                                  {tf(t.incident.designated, {
                                    name: m.heirName ?? "?",
                                    relation: m.heirRelation ?? "?",
                                    phone: m.heirPhone,
                                  })}
                                </p>
                              )}
                            </div>
                          )}
                          {!m.verifiedAt && (
                            <div className="flex flex-wrap gap-4">
                              <ActionForm action={inviteAction}>
                                <input type="hidden" name="memberId" value={m.id} />
                                <button className={link}>{t.verify.invite}</button>
                              </ActionForm>
                              {m.userId !== user.id && (
                                <ActionForm action={confirmAction}>
                                  <input type="hidden" name="memberId" value={m.id} />
                                  <button className="text-sm text-muted underline" title={t.verify.confirmHelp}>
                                    {t.verify.confirm}
                                  </button>
                                </ActionForm>
                              )}
                            </div>
                          )}
                          {!m.verifiedAt && m.userId !== user.id && <p className="text-xs text-muted">{t.verify.confirmHelp}</p>}
                          <ActionForm action={editPaymentAction} className="flex flex-wrap items-end gap-2">
                            <input type="hidden" name="memberId" value={m.id} />
                            <input name="phone" type="tel" defaultValue={m.phone} required className={`${input} min-w-0 flex-1`} />
                            <select name="network" defaultValue={m.network} className={input}>
                              {Object.entries(NETWORKS).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                            <button className={button}>{t.common.save}</button>
                            <p className="basis-full text-xs text-muted">{t.verify.editHelp}</p>
                          </ActionForm>
                        </div>
                      </details>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          <ReserveSection tontine={tontine} t={t} />

          {(tontine.guaranteeBps > 0 || tontine.type === "SOLIDARITY" || tontine.fundEntries.length > 0) && (
            <section className={card}>
              <div className="flex items-baseline justify-between">
                <h2 className="font-semibold">{tontine.type === "SOLIDARITY" ? t.tontine.caisse : t.tontine.fund}</h2>
                <span className="text-lg font-semibold text-accent">{formatXof(tontine.fundXof)}</span>
              </div>
              {tontine.fundEntries.length === 0 ? (
                <p className="text-sm text-muted">{t.tontine.fundEmpty}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {tontine.fundEntries.map((e) => (
                    <li key={e.id} className="flex justify-between gap-3">
                      <span className="text-muted">{e.label}</span>
                      <span className={e.amountXof < 0 ? "text-danger" : "text-accent"}>
                        {e.amountXof > 0 ? "+" : ""}
                        {formatXof(e.amountXof)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function RoundProgress({
  round,
  recipients,
  late,
  t,
  date,
}: {
  round: { contributions: { status: string }[]; dueAt: Date };
  recipients: { network: string; phone: string }[];
  late: boolean;
  t: Awaited<ReturnType<typeof getDict>>;
  date: (d: Date) => string;
}) {
  const settled = round.contributions.filter((c) => c.status !== "pending").length;
  const total = round.contributions.length;
  return (
    <div>
      <div className="mb-1 flex flex-wrap justify-between gap-2 text-sm">
        <span>{tf(t.tontine.received, { paid: settled, total })}</span>
        <span className={late ? "text-danger" : "text-muted"}>{tf(t.tontine.due, { date: date(round.dueAt) })}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-border">
        <div className="h-full bg-accent transition-all" style={{ width: `${(settled / Math.max(total, 1)) * 100}%` }} />
      </div>
      {recipients.map((r) => (
        <p key={r.phone} className="mt-1 text-sm text-muted">
          {tf(t.tontine.payoutTo, { network: NETWORKS[r.network], phone: r.phone })}
        </p>
      ))}
    </div>
  );
}

function VoiceToggle({ memberId, on, t }: { memberId: string; on: boolean; t: Awaited<ReturnType<typeof getDict>> }) {
  return (
    <ActionForm action={voiceAction}>
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="on" value={on ? "0" : "1"} />
      <button className="text-sm text-muted underline" title={t.voice.help}>
        {on ? t.voice.disable : t.voice.enable}
      </button>
    </ActionForm>
  );
}

// Anneau de progression des cotisations du tour.
function Ring({ value, total, label }: { value: number; total: number; label: string }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const ratio = total ? value / total : 0;
  return (
    <div className="relative h-20 w-20 shrink-0">
      <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke="url(#natt-ring)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
        />
        <defs>
          <linearGradient id="natt-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffb547" />
            <stop offset="100%" stopColor="#f7931a" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-lg font-bold">
          {value}/{total}
        </span>
        <span className="text-[10px] text-muted">{label}</span>
      </span>
    </div>
  );
}
