import type { Dict } from "@/lib/i18n/fr";
import type { Reliability } from "@/lib/score";

export function ScoreCard({ r, t }: { r: Reliability; t: Dict }) {
  const stats = [
    [t.score.onTime, r.onTime],
    [t.score.late, r.late],
    [t.score.missed, r.missed],
    [t.score.penalties, r.penalties],
  ] as const;
  return (
    <div className="space-y-4 card p-4">
      {r.score === null ? (
        <p className="text-muted">{t.score.tooShort}</p>
      ) : (
        <p className="text-5xl font-bold text-accent">
          {r.score}
          <span className="text-xl text-muted">/100</span>
        </p>
      )}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-background p-3">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="text-xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
