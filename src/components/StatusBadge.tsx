import { AlertTriangle, Check, Clock, ShieldCheck } from "lucide-react";

const STYLES: Record<string, string> = {
  paid: "bg-success-soft text-success",
  covered: "bg-accent-soft text-accent",
  pending: "bg-warn-soft text-warn",
  late: "bg-danger-soft text-danger",
  "verified-manual": "bg-surface-2 text-foreground",
};

const ICONS: Record<string, typeof Check> = { paid: Check, covered: ShieldCheck, pending: Clock, late: AlertTriangle };

export function StatusBadge({ status, label }: { status: string; label: string }) {
  const Icon = ICONS[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLES[status] ?? "bg-surface-2 text-muted"}`}>
      {Icon && <Icon size={12} strokeWidth={2.5} />}
      {label}
    </span>
  );
}
