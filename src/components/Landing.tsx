import {
  ArrowRight,
  BadgeCheck,
  Blocks,
  Building2,
  Check,
  ChevronDown,
  Clock,
  FileCheck,
  Globe,
  HeartHandshake,
  Lock,
  Mic,
  PiggyBank,
  QrCode,
  Repeat,
  ScrollText,
  ShieldCheck,
  Smartphone,
  Store,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import Link from "next/link";
import QRCode from "qrcode";
import { Avatar } from "@/components/Brand";
import { db } from "@/lib/db";
import { tf } from "@/lib/i18n";
import { landingDict } from "@/lib/i18n/landing";
import { appUrl } from "@/lib/i18n/notifications";
import { feeBps, formatXof, xofToSats } from "@/lib/money";

// Page d'accueil des visiteurs : toujours sombre, identité Bitcoin / Lightning.
export async function Landing({ locale }: { locale: string }) {
  const L = landingDict(locale);
  const [offers, sats, qr] = await Promise.all([
    db.offer.findMany({ where: { active: true, merchant: { active: true } }, include: { merchant: true }, orderBy: { createdAt: "asc" }, take: 3 }),
    xofToSats(1_000).catch(() => null),
    QRCode.toDataURL(appUrl("/signup"), { margin: 1, width: 240, color: { dark: "#0b0c10", light: "#ffffff" } }),
  ]);
  const live = process.env.PAYMENT_PROVIDER === "bitnob";
  const fee = (feeBps() / 100).toLocaleString("fr-FR");

  return (
    <div className="night">
      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="grid-bg pointer-events-none absolute inset-0" />
        <div className="glow pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-16 pb-20 lg:grid-cols-[1.1fr_0.9fr] lg:pt-24">
          <div className="space-y-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
              <Zap size={13} className="animate-bolt fill-current" /> {L.hero.badge}
            </span>
            <h1 className="text-5xl leading-[1.02] font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
              {L.hero.title1}
              <br />
              <span className="text-gradient">{L.hero.title2}</span>
            </h1>
            <p className="max-w-xl text-lg text-muted">{L.hero.subtitle}</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/signup" className="btn btn-lg">
                {L.hero.cta} <ArrowRight size={18} />
              </Link>
              <Link href="#comment" className="btn-ghost btn-lg">
                {L.hero.cta2}
              </Link>
            </div>
            <ul className="grid gap-2 text-sm text-muted sm:grid-cols-2">
              {L.hero.proofs.map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-success-soft text-success">
                    <Check size={12} strokeWidth={3} />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
            {sats !== null && (
              <p className="inline-flex items-center gap-2 font-mono text-xs text-muted">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                {tf(L.rate.label, { sats: sats.toLocaleString("fr-FR") })} · {live ? L.rate.live : L.rate.simulated}
              </p>
            )}
          </div>

          <HeroMock L={L} qr={qr} sats={sats} />
        </div>
      </section>

      {/* ─── Comment ça marche ────────────────────────────────────────── */}
      <section id="comment" className="scroll-mt-20 border-t border-white/5">
        <div className="mx-auto max-w-6xl space-y-12 px-4 py-20">
          <Heading eyebrow={L.how.eyebrow} title={L.how.title} />
          <ol className="grid gap-5 md:grid-cols-3">
            {L.how.steps.map((s, i) => {
              const Icon = [Users, Zap, Wallet][i];
              return (
                <li key={s.title} className="card relative space-y-4 p-6">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                      <Icon size={22} />
                    </span>
                    <span className="font-mono text-4xl font-bold text-white/10">0{i + 1}</span>
                  </div>
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <p className="text-sm text-muted">{s.text}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ─── Pourquoi Lightning ───────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-white/5">
        <div className="glow pointer-events-none absolute -right-40 top-10 h-[28rem] w-[28rem]" />
        <div className="relative mx-auto max-w-6xl space-y-12 px-4 py-20">
          <Heading eyebrow={L.why.eyebrow} title={L.why.title} />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {L.why.items.map((w, i) => {
              const Icon = [Clock, Globe, ShieldCheck, Blocks][i];
              return (
                <div key={w.title} className="card space-y-3 p-6">
                  <Icon size={24} className="text-accent" />
                  <h3 className="font-semibold">{w.title}</h3>
                  <p className="text-sm text-muted">{w.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── Fonctionnalités ──────────────────────────────────────────── */}
      <section className="border-t border-white/5">
        <div className="mx-auto max-w-6xl space-y-12 px-4 py-20">
          <Heading eyebrow={L.features.eyebrow} title={L.features.title} />
          <div className="grid gap-px overflow-hidden rounded-3xl border border-white/5 bg-white/5 sm:grid-cols-2 lg:grid-cols-3">
            {L.features.items.map((f, i) => {
              const Icon = [Users, Repeat, Mic, BadgeCheck, PiggyBank, HeartHandshake, Clock, Building2, Smartphone][i];
              return (
                <div key={f.title} className="space-y-2 bg-[#0b0c12] p-6 transition hover:bg-[#10121a]">
                  <Icon size={20} className="text-accent" />
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="text-sm text-muted">{f.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── Marchands et attestation ─────────────────────────────────── */}
      <section className="border-t border-white/5">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-20 lg:grid-cols-2">
          <div className="card flex flex-col gap-5 p-7">
            <span className="eyebrow inline-flex items-center gap-2">
              <Store size={14} /> {L.merchants.eyebrow}
            </span>
            <h2 className="text-3xl font-bold tracking-tight">{L.merchants.title}</h2>
            <p className="text-muted">{L.merchants.text}</p>
            {offers.length > 0 && (
              <ul className="space-y-2">
                {offers.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-2 px-4 py-3">
                    <span>
                      <span className="block font-medium">{o.title}</span>
                      <span className="text-xs text-muted">{o.merchant.name}</span>
                    </span>
                    <span className="text-right">
                      <span className="block font-semibold text-accent">{formatXof(o.nattPriceXof)}</span>
                      {o.priceXof > o.nattPriceXof && <span className="text-xs text-muted line-through">{formatXof(o.priceXof)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/marchands" className="link mt-auto">
              {L.merchants.cta} <ArrowRight size={15} />
            </Link>
          </div>

          <div className="card flex flex-col gap-5 p-7">
            <span className="eyebrow inline-flex items-center gap-2">
              <FileCheck size={14} /> {L.certificate.eyebrow}
            </span>
            <h2 className="text-3xl font-bold tracking-tight">{L.certificate.title}</h2>
            <p className="text-muted">{L.certificate.text}</p>
            <div className="rounded-2xl border border-success/30 bg-success-soft p-5">
              <p className="flex items-center gap-2 font-semibold text-success">
                <ShieldCheck size={18} /> {L.certificate.sample.status}
              </p>
              <p className="mt-1 font-mono text-xs text-muted">{L.certificate.sample.number}</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-black/30 p-3">
                  <p className="text-xs text-muted">{L.certificate.sample.onTime}</p>
                  <p className="text-xl font-bold">24 / 24</p>
                </div>
                <div className="rounded-xl bg-black/30 p-3">
                  <p className="text-xs text-muted">{L.certificate.sample.score}</p>
                  <p className="text-xl font-bold">100<span className="text-sm text-muted">/100</span></p>
                </div>
              </div>
            </div>
            <Link href="/v" className="link mt-auto">
              {L.certificate.cta} <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Confiance ────────────────────────────────────────────────── */}
      <section id="confiance" className="scroll-mt-20 border-t border-white/5">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 lg:grid-cols-2">
          <Heading eyebrow={L.trust.eyebrow} title={L.trust.title} left />
          <ul className="space-y-3">
            {L.trust.items.map((item, i) => {
              const Icon = [Wallet, BadgeCheck, ScrollText, Lock][i];
              return (
                <li key={item} className="card flex items-start gap-4 p-4">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <Icon size={18} />
                  </span>
                  <span className="pt-1.5 text-sm">{item}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ─── FAQ ──────────────────────────────────────────────────────── */}
      <section id="faq" className="scroll-mt-20 border-t border-white/5">
        <div className="mx-auto max-w-3xl space-y-10 px-4 py-20">
          <Heading eyebrow={L.faq.eyebrow} title={L.faq.title} />
          <div className="space-y-3">
            {L.faq.items.map((f) => (
              <details key={f.q} className="card group p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {f.q}
                  <ChevronDown size={18} className="shrink-0 text-muted transition group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm text-muted">{tf(f.a, { fee })}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Appel final ──────────────────────────────────────────────── */}
      <section className="border-t border-white/5">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="relative overflow-hidden rounded-[2rem] border border-accent/30 bg-gradient-to-br from-[#2a1500] via-[#120a02] to-[#07080c] p-10 text-center sm:p-14">
            <div className="glow pointer-events-none absolute -top-24 left-1/2 h-80 w-80 -translate-x-1/2" />
            <div className="relative space-y-5">
              <Zap size={40} className="animate-bolt mx-auto fill-accent text-accent" />
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{L.final.title}</h2>
              <p className="mx-auto max-w-lg text-muted">{L.final.text}</p>
              <Link href="/signup" className="btn btn-lg">
                {L.final.cta} <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Heading({ eyebrow, title, left }: { eyebrow: string; title: string; left?: boolean }) {
  return (
    <div className={`space-y-3 ${left ? "" : "mx-auto max-w-2xl text-center"}`}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
    </div>
  );
}

// Maquette d'une tontine en cours : cotisations en Lightning, facture, versement sur Wave.
function HeroMock({ L, qr, sats }: { L: ReturnType<typeof landingDict>; qr: string; sats: number | null }) {
  const members = [
    { name: "Awa Ndiaye", paid: true, time: "0,8 s" },
    { name: "Moussa Diop", paid: true, time: "1,2 s" },
    { name: "Fatou Sow", paid: true, time: "0,6 s" },
    { name: "Ibrahima Fall", paid: false, time: "" },
  ];
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="animate-float card relative space-y-5 border-white/10 bg-[#0f1118]/90 p-6 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{L.mock.tontine}</p>
            <p className="text-xs text-muted">{L.mock.round}</p>
          </div>
          <span className="badge badge-accent">
            <Zap size={11} className="fill-current" /> Lightning
          </span>
        </div>
        <div>
          <p className="text-xs text-muted">{L.mock.pot}</p>
          <p className="text-3xl font-extrabold tracking-tight">
            160 000 <span className="text-base font-semibold text-muted">FCFA</span>
          </p>
          {sats !== null && <p className="font-mono text-xs text-accent">≈ {(sats * 160).toLocaleString("fr-FR")} sats</p>}
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-[#ffb547] to-[#f7931a]" />
          </div>
        </div>
        <ul className="space-y-2.5">
          {members.map((m) => (
            <li key={m.name} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2.5">
                <Avatar name={m.name} size={28} />
                {m.name}
              </span>
              {m.paid ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                  <Zap size={12} className="fill-current" /> {L.mock.paid} · {m.time}
                </span>
              ) : (
                <span className="text-xs text-muted">{L.mock.pending}</span>
              )}
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-black/30 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="" className="h-20 w-20 rounded-lg" />
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <QrCode size={15} className="text-accent" /> {L.mock.invoice}
            </p>
            <p className="truncate font-mono text-[11px] text-muted">lnbc200u1pnatt…q9xk7w</p>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-5 left-3 flex items-center gap-3 rounded-2xl border border-success/30 bg-[#0c1a14] px-4 py-3 shadow-2xl sm:-left-8">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-success text-black">
          <Check size={18} strokeWidth={3} />
        </span>
        <span>
          <span className="block text-sm font-semibold">{L.mock.toast}</span>
          <span className="text-xs text-muted">160 000 FCFA · {L.mock.seconds}</span>
        </span>
      </div>
    </div>
  );
}
