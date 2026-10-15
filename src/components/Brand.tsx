import { Zap } from "lucide-react";
import Link from "next/link";

// Logo Natt : un éclair Lightning dans un carré orange Bitcoin.
export function Logo({ size = 32, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5">
      <span
        className="relative inline-flex items-center justify-center rounded-[30%] shadow-[0_6px_20px_-6px_rgba(247,147,26,0.8)]"
        style={{ width: size, height: size, background: "linear-gradient(135deg,#ffc56b 0%,#f7931a 50%,#e46a00 100%)" }}
      >
        <Zap size={size * 0.58} strokeWidth={2.4} className="fill-[#1a0d00] text-[#1a0d00]" />
      </span>
      {withText && <span className="text-xl font-extrabold tracking-tight">Natt</span>}
    </Link>
  );
}

// Pastille des initiales d'un membre.
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ring-2 ring-surface"
      style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${h} 70% 55%), hsl(${(h + 40) % 360} 70% 40%))` }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
