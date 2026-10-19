// The number tiles used across the app (module overviews, reports, the portal), in the same style as
// the dashboard cards: a coloured icon, the figure, and optionally a small chart and a badge.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { KpiBadgePill, Spark, guessKpi, type KpiBadge } from "@/components/charts/kpi-card";

const TONE = { warning: "var(--warning)", danger: "var(--destructive)", success: "var(--success)", info: "var(--info)" } as const;
const TONE_TEXT = { warning: "text-warning", danger: "text-destructive", success: "text-success", info: "text-info" } as const;

/** A big number with a label: "Owed to you  $4,200". `inGrid` is accepted for older callers and ignored. */
export function KpiTile({ label, value, hint, icon, tone, color, badge, trend, bars, className }: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: keyof typeof TONE;
  /** A theme colour, e.g. "var(--chart-2)". Defaults to the tone, or a guess from the label. */
  color?: string;
  badge?: KpiBadge;
  trend?: number[];
  bars?: number[];
  inGrid?: boolean;
  className?: string;
}) {
  const [Guessed, guessedColor] = guessKpi(label);
  const c = color ?? (tone ? TONE[tone] : guessedColor);
  return (
    <div className={cn("relative flex min-w-0 flex-col justify-between overflow-hidden border border-border bg-card p-4 shadow-sm", className)}>
      <span aria-hidden className="pointer-events-none absolute -left-10 -top-10 size-32 rounded-full opacity-[0.07]" style={{ background: c }} />
      <div className="relative flex items-start justify-between gap-2">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full [&>svg]:size-4"
          style={{ background: `color-mix(in oklch, ${c} 15%, transparent)`, color: c }}
        >
          {icon ?? <Guessed />}
        </span>
        {badge && <KpiBadgePill badge={badge} />}
      </div>
      <div className="relative mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm text-muted-foreground">{label}</div>
          <div className={cn("mt-0.5 truncate text-2xl font-semibold tabular-nums", tone && TONE_TEXT[tone])}>{value}</div>
          {hint && <div className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</div>}
        </div>
        <Spark id={label} color={c} trend={trend} bars={bars} />
      </div>
    </div>
  );
}

/** A small label and value, for summary rows inside a card. */
export function Stat({ label, value, inGrid }: { label: string; value: ReactNode; inGrid?: boolean }) {
  return (
    <div className={inGrid ? "bg-card px-5 py-3" : undefined}>
      <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
