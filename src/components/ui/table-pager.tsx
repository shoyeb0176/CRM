import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZES } from "@/lib/use-paged";

/** Rows-per-page picker, "51–75 of 312" and Previous/Next. Only changes table state, never the page. */
export function TablePager({ page, size, total, onPage, onSize }: {
  page: number; size: number; total: number | null | undefined;
  onPage: (p: number) => void; onSize: (n: number) => void;
}) {
  const n = total ?? 0;
  const first = n === 0 ? 0 : page * size + 1;
  const last = Math.min(n, (page + 1) * size);
  const btn = "inline-flex size-8 items-center justify-center border border-border hover:bg-accent disabled:pointer-events-none disabled:opacity-40";
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-4 py-2 font-mono text-xs text-muted-foreground">
      <label className="flex items-center gap-2 uppercase tracking-wider">
        Rows
        <select value={size} onChange={(e) => onSize(Number(e.target.value))} className="border border-input bg-card shadow-xs px-2 py-1 text-foreground">
          {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <span className="tabular-nums">{first}–{last} of {n}</span>
      <div className="flex gap-1">
        <button type="button" aria-label="Previous page" className={btn} disabled={page === 0} onClick={() => onPage(page - 1)}><ChevronLeft className="size-4" /></button>
        <button type="button" aria-label="Next page" className={btn} disabled={last >= n} onClick={() => onPage(page + 1)}><ChevronRight className="size-4" /></button>
      </div>
    </div>
  );
}
