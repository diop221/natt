"use client";

import { ArrowRight, Check, Zap } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import type { AuthState } from "@/app/actions";
import { useDict } from "@/components/I18n";

export function AuthForm({
  mode,
  action,
  next,
}: {
  mode: "login" | "signup";
  action: (prev: AuthState, form: FormData) => Promise<AuthState>;
  next: string;
}) {
  const t = useDict();
  const [state, formAction, pending] = useActionState(action, undefined);
  const signup = mode === "signup";
  const other = `${signup ? "/login" : "/signup"}${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <div className="mx-auto grid max-w-5xl overflow-hidden rounded-[2rem] border border-border lg:grid-cols-2">
      {/* Panneau de marque */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#2a1500] via-[#120a02] to-[#07080c] p-10 lg:block">
        <div className="grid-bg pointer-events-none absolute inset-0" />
        <div className="glow pointer-events-none absolute -top-20 -left-20 h-80 w-80" />
        <div className="relative flex h-full flex-col justify-between gap-10">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ffc56b] via-[#f7931a] to-[#e46a00] shadow-[0_10px_30px_-8px_rgba(247,147,26,0.8)]">
            <Zap size={28} className="fill-[#1a0d00] text-[#1a0d00]" />
          </span>
          <div className="space-y-5">
            <h2 className="text-3xl leading-tight font-extrabold tracking-tight text-white">{t.auth.panelTitle}</h2>
            <ul className="space-y-3 text-sm text-white/70">
              {t.auth.panelPoints.map((p) => (
                <li key={p} className="flex items-center gap-2.5">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#f7931a]/20 text-[#f7931a]">
                    <Check size={12} strokeWidth={3} />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#f7931a]">
            <Zap size={13} className="fill-current" /> {t.nav.poweredBy}
          </p>
        </div>
      </div>

      {/* Formulaire */}
      <form action={formAction} className="space-y-5 bg-surface p-8 sm:p-10">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{signup ? t.auth.join : t.auth.welcome}</h1>
          <p className="text-sm text-muted">{signup ? t.auth.joinSub : t.auth.welcomeSub}</p>
        </div>
        <input type="hidden" name="next" value={next} />
        {signup && (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t.auth.name}</span>
            <input name="name" className="input w-full" autoComplete="name" defaultValue={state?.name} required />
          </label>
        )}
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t.auth.phone}</span>
          <input
            name="phone"
            type="tel"
            className="input w-full"
            placeholder="77 123 45 67 · +33 6 12 34 56 78"
            autoComplete="tel"
            defaultValue={state?.phone}
            required
          />
          {signup && <span className="block text-xs text-muted">{t.auth.phoneHelp}</span>}
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t.auth.password}</span>
          <input
            name="password"
            type="password"
            className="input w-full"
            autoComplete={signup ? "new-password" : "current-password"}
            minLength={signup ? 8 : undefined}
            required
          />
        </label>
        {state?.error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
        <button disabled={pending} className="btn btn-lg w-full">
          {pending ? "…" : signup ? t.auth.createAccount : t.auth.login}
          {!pending && <ArrowRight size={18} />}
        </button>
        <p className="text-center text-sm text-muted">
          {signup ? t.auth.haveAccount : t.auth.noAccount}{" "}
          <Link href={other} className="link">
            {signup ? t.auth.login : t.auth.signup}
          </Link>
        </p>
      </form>
    </div>
  );
}
