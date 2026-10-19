// Building blocks for the dashboard and module overview charts: a titled panel, the loading and
// empty states, and number formats. Charts themselves use recharts through ui/chart.tsx.
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { linkTarget } from "@/lib/notifications/kinds";

export const money = (n: number, ccy = "USD") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(n);
export const short = (n: number) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);
/** "2026-10" → "Oct". */
export const monthLabel = (k: string) => new Date(`${k.slice(0, 7)}-01T00:00:00`).toLocaleDateString(undefined, { month: "short" });
/** "2026-10-06" → "6 Oct". */
export const dayLabel = (k: string) => new Date(`${k}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
export const words = (s: string) => s.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase()).replace(/\bai\b/gi, "AI");

export function Panel({ title, hint, to, children }: { title: string; hint: string; to?: string; children: ReactNode }) {
  return (
    <section className="border border-border bg-card shadow-sm p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        {to && <Link to={to} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Open <ArrowRight className="size-3" /></Link>}
      </div>
      {children}
    </section>
  );
}

export const ChartSkeleton = () => <Skeleton className="h-64 w-full" />;

export function ChartEmpty({ text, to, cta }: { text: string; to: string; cta: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-2 border border-dashed border-border text-sm text-muted-foreground">
      {text} <Link {...(linkTarget(to) as { to: string })} className="text-primary hover:underline">{cta} →</Link>
    </div>
  );
}
