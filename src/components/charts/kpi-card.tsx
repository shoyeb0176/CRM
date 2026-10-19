// Dashboard number cards: a coloured icon, the figure, a small chart of where it came from, and a
// badge with the change since last month (or a count, where there's no history to compare with).
import type { ComponentType } from "react";
import { Link } from "@tanstack/react-router";
import { Area, AreaChart, Bar, BarChart } from "recharts";
import {
  AlertTriangle, BarChart3, Boxes, Briefcase, CalendarClock, CheckCircle2, Clock, FileText, Package,
  Receipt, ShoppingCart, TrendingDown, TrendingUp, Users, Wallet,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export type KpiBadge = { text: string; tone: "good" | "bad" | "neutral"; caption?: string };

const BADGE = {
  good: "bg-success text-white",
  bad: "bg-destructive text-destructive-foreground",
  neutral: "bg-muted text-muted-foreground",
} as const;

/** "+12%" / "-8%", green when the change is the good direction for this number. */
export function changeBadge(now: number, before: number, good: "up" | "down"): KpiBadge {
  const pct = !before ? (now ? 100 : 0) : Math.round(((now - before) / before) * 100);
  const better = pct === 0 ? null : (pct > 0) === (good === "up");
  return { text: `${pct > 0 ? "+" : ""}${pct}%`, tone: better == null ? "neutral" : better ? "good" : "bad", caption: "vs last month" };
}

// ponytail: icon and colour guessed from the label when the caller passes none; pass `icon`/`color` to override.
const GUESS: Array<[RegExp, typeof Wallet, string]> = [
  [/overdue|late|out of stock|lost|failed|suspend/i, AlertTriangle, "var(--destructive)"],
  [/low stock|expir|unpaid|trial|pending|waiting|outstanding|owed|balance|receivable/i, Clock, "var(--warning)"],
  [/won|paid|net pay|done|complete|active sub/i, CheckCircle2, "var(--success)"],
  [/revenue|cash|value|pipeline|amount|mrr|gross|lifetime/i, Wallet, "var(--chart-2)"],
  [/expense|spend|spent|bill|tax|deduction|cost|po\b|pos\b/i, Receipt, "var(--chart-1)"],
  [/stock|sku|product|inventory/i, Boxes, "var(--chart-4)"],
  [/order|purchase/i, ShoppingCart, "var(--chart-4)"],
  [/user|employee|contact|lead|member|customer|org/i, Users, "var(--info)"],
  [/deal|project/i, Briefcase, "var(--chart-3)"],
  [/hour|time|activit|task/i, CalendarClock, "var(--chart-3)"],
  [/invoice|quote|doc/i, FileText, "var(--info)"],
  [/item|unit/i, Package, "var(--chart-4)"],
  [/up|growth/i, TrendingUp, "var(--success)"],
  [/down|churn/i, TrendingDown, "var(--destructive)"],
];
export function guessKpi(label: string): [typeof Wallet, string] {
  const hit = GUESS.find(([re]) => re.test(label));
  return hit ? [hit[1], hit[2]] : [BarChart3, "var(--primary)"];
}

export function KpiCard({ label, value, icon, color: colorProp, to, badge, trend, bars }: {
  label: string;
  value: string | null;
  /** Defaults to a guess from the label. */
  icon?: ComponentType<{ className?: string }>;
  /** A theme colour, e.g. "var(--chart-2)". Defaults to a guess from the label. */
  color?: string;
  to: string;
  badge?: KpiBadge;
  /** A line over time (oldest first): drawn as a small area curve. */
  trend?: number[];
  /** A few values side by side (stages, statuses): drawn as small bars. */
  bars?: number[];
}) {
  const [Guessed, guessedColor] = guessKpi(label);
  const Icon = icon ?? Guessed;
  const color = colorProp ?? guessedColor;
  return (
    <Link
      to={to}
      className="group relative flex min-h-28 flex-col sm:min-h-36 justify-between overflow-hidden border border-border bg-card p-4 shadow-sm transition-colors hover:border-foreground/30"
    >
      {/* A faint wash of the card's colour in the corner. */}
      <span aria-hidden className="pointer-events-none absolute -left-10 -top-10 size-36 rounded-full opacity-[0.07]" style={{ background: color }} />
      <div className="relative flex items-start justify-between gap-2">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full text-white" style={{ background: color }}>
          <Icon className="size-5" />
        </span>
        {badge && <KpiBadgePill badge={badge} />}
      </div>
      <div className="relative mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm text-muted-foreground">{label}</div>
          <div className="mt-0.5 truncate text-2xl font-semibold tabular-nums">{value ?? <Skeleton className="h-7 w-20" />}</div>
        </div>
        <Spark id={label} color={color} trend={trend} bars={bars} />
      </div>
    </Link>
  );
}

/** The small chart in the card's corner: a curve over time, or bars side by side. Nothing when flat. */
export function Spark({ id, color, trend, bars }: { id: string; color: string; trend?: number[]; bars?: number[] }) {
  const points = (trend ?? bars ?? []).map((v, i) => ({ i, v }));
  if (points.length < 2 || points.every((p) => p.v === 0)) return null;
  const gid = `kpi-${id.replace(/\W+/g, "-")}`;
  return (
    <div className="h-12 w-24 shrink-0" aria-hidden>
      {trend ? (
        <AreaChart width={96} height={48} data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${gid})`} isAnimationActive={false} />
        </AreaChart>
      ) : (
        <BarChart width={96} height={48} data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="25%">
          <Bar dataKey="v" fill={color} isAnimationActive={false} minPointSize={2} />
        </BarChart>
      )}
    </div>
  );
}

export function KpiBadgePill({ badge }: { badge: KpiBadge }) {
  return (
    <div className="text-right">
      <span className={`inline-block px-2 py-0.5 text-xs font-semibold tabular-nums ${BADGE[badge.tone]}`}>{badge.text}</span>
      {badge.caption && <div className="mt-1 text-xs text-muted-foreground">{badge.caption}</div>}
    </div>
  );
}
