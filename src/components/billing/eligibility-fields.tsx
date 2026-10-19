// Two questions that decide whether the free Startup plan fits (lib/billing/eligibility.ts).
import { EMPLOYEE_BANDS, REVENUE_BANDS } from "@/lib/billing/eligibility";

const sel = "w-full border border-input bg-card px-3 py-2 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60";

export function EligibilityFields({ employee, revenue, onChange, disabled }: {
  employee: string; revenue: string; disabled?: boolean;
  onChange: (v: { employee: string; revenue: string }) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="mb-1 block text-xs text-muted-foreground">How many people work here?</span>
        <select className={sel} value={employee} disabled={disabled} onChange={(e) => onChange({ employee: e.target.value, revenue })}>
          <option value="">Choose…</option>
          {EMPLOYEE_BANDS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-muted-foreground">Revenue in the last 12 months</span>
        <select className={sel} value={revenue} disabled={disabled} onChange={(e) => onChange({ employee, revenue: e.target.value })}>
          <option value="">Choose…</option>
          {REVENUE_BANDS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
      </label>
    </div>
  );
}
