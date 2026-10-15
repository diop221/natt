"use client";

import { Award, LayoutDashboard, Shield, Store, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS = { home: LayoutDashboard, orgs: Users, merchants: Store, score: Award, admin: Shield };

// Navigation principale ; le lien de la page en cours est mis en avant.
export function Nav({ items }: { items: { href: string; label: string; icon: keyof typeof ICONS }[] }) {
  const path = usePathname();
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto text-sm">
      {items.map(({ href, label, icon }) => {
        const Icon = ICONS[icon];
        const active = href === "/" ? path === "/" || path.startsWith("/tontines") : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition ${
              active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            <Icon size={15} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

// La page d'accueil des visiteurs occupe toute la largeur ; les autres pages sont centrées.
export function Main({ children, fullBleedHome }: { children: React.ReactNode; fullBleedHome: boolean }) {
  const path = usePathname();
  if (fullBleedHome && path === "/") return <main>{children}</main>;
  return <main className="mx-auto max-w-6xl px-4 py-8 sm:py-10">{children}</main>;
}
