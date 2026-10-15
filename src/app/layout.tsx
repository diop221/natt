import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { LogOut, Zap } from "lucide-react";
import { logout, setLocale } from "@/app/actions";
import { Logo } from "@/components/Brand";
import { I18nProvider } from "@/components/I18n";
import { Main, Nav } from "@/components/Nav";
import { getCurrentUser } from "@/lib/auth";
import { getDict, getLocale } from "@/lib/i18n";
import { isNattAdmin } from "@/lib/merchants";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Natt · La tontine sans trésorier, sur Bitcoin Lightning",
  description: "Cotisez en Lightning d'où que vous soyez ; la cagnotte part automatiquement sur Wave ou Orange Money.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [user, t, locale] = await Promise.all([getCurrentUser(), getDict(), getLocale()]);
  const mock = process.env.PAYMENT_PROVIDER !== "bitnob";
  const nav = user
    ? [
        { href: "/", label: t.nav.home, icon: "home" as const },
        { href: "/organisations", label: t.nav.orgs, icon: "orgs" as const },
        { href: "/marchands", label: t.nav.merchants, icon: "merchants" as const },
        { href: "/score", label: t.nav.score, icon: "score" as const },
        ...(isNattAdmin(user) ? [{ href: "/admin", label: t.nav.admin, icon: "admin" as const }] : []),
      ]
    : [];

  return (
    <html lang={locale}>
      {/* Visiteurs (accueil, connexion, pages publiques) : toujours en mode nuit. */}
      <body className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col font-sans ${user ? "" : "night"}`}>
        <I18nProvider dict={t}>
          <header className={`sticky top-0 z-40 border-b backdrop-blur-xl ${user ? "border-border bg-background/80" : "border-white/5 bg-[#07080c]/80"}`}>
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
              <Logo />
              {user && (
                <div className="order-3 w-full sm:order-none sm:w-auto">
                  <Nav items={nav} />
                </div>
              )}
              <div className="ml-auto flex items-center gap-2 text-sm">
                {mock && (
                  <Link href="/dev/messages" className="badge badge-accent hidden lg:inline-flex" title={t.nav.messages}>
                    <Zap size={12} /> {t.nav.simulated}
                  </Link>
                )}
                <form action={setLocale} className="flex overflow-hidden rounded-full border border-border bg-surface text-xs">
                  {(["fr", "wo"] as const).map((l) => (
                    <button
                      key={l}
                      name="locale"
                      value={l}
                      className={`px-2.5 py-1 font-semibold uppercase transition ${locale === l ? "bg-accent text-black" : "text-muted hover:text-foreground"}`}
                    >
                      {l}
                    </button>
                  ))}
                </form>
                {user ? (
                  <form action={logout}>
                    <button className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-muted transition hover:bg-surface-2 hover:text-foreground" title={t.nav.logout}>
                      <LogOut size={15} />
                      <span className="hidden xl:inline">{t.nav.logout}</span>
                    </button>
                  </form>
                ) : (
                  <>
                    <Link href="/login" className="hidden px-2 font-medium text-muted hover:text-foreground sm:inline">
                      {t.nav.login}
                    </Link>
                    <Link href="/signup" className="btn">
                      {t.nav.start}
                    </Link>
                  </>
                )}
              </div>
            </div>
          </header>

          <div className="flex-1">
            <Main fullBleedHome={!user}>{children}</Main>
          </div>

          <footer className={`border-t print:hidden ${user ? "border-border" : "border-white/5"}`}>
            <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-[2fr_1fr_1fr]">
              <div className="space-y-3">
                <Logo size={28} />
                <p className="max-w-sm text-muted">{t.nav.footerTagline}</p>
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
                  <Zap size={13} className="fill-current" /> {t.nav.poweredBy}
                </p>
              </div>
              <div className="space-y-2">
                <p className="font-semibold">{t.nav.product}</p>
                <ul className="space-y-1.5 text-muted">
                  <li><Link href="/#comment" className="hover:text-foreground">{t.nav.howItWorks}</Link></li>
                  <li><Link href="/marchands" className="hover:text-foreground">{t.nav.merchants}</Link></li>
                  <li><Link href="/#faq" className="hover:text-foreground">{t.nav.faq}</Link></li>
                </ul>
              </div>
              <div className="space-y-2">
                <p className="font-semibold">{t.nav.trust}</p>
                <ul className="space-y-1.5 text-muted">
                  <li><Link href="/v" className="hover:text-foreground">{t.nav.verifyCertificate}</Link></li>
                  <li><Link href="/#confiance" className="hover:text-foreground">{t.nav.trust}</Link></li>
                </ul>
              </div>
            </div>
          </footer>
        </I18nProvider>
      </body>
    </html>
  );
}
