import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { useOrgId } from "@/lib/crm/use-org";
import { fmtMoney, ACCOUNT_TYPE_LABELS } from "@/lib/accounting/use-accounting";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/app/accounting/trial")({
  head: () => ({ meta: [{ title: "Trial Balance — Accounting" }] }),
  component: TrialPage,
});

type Row = { code: string; name: string; type: string; debit: number; credit: number };

function TrialPage() {
  const orgId = useOrgId();
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));

  const q = useQuery({
    queryKey: ["trial", orgId, asOf], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journal_entry_lines")
        .select("debit, credit, account:chart_of_accounts!inner(id, code, name, account_type), journal_entries!inner(status, entry_date, org_id)")
        .eq("org_id", orgId!)
        .eq("journal_entries.status", "posted")
        .lte("journal_entries.entry_date", asOf);
      if (error) throw error;
      const map = new Map<string, Row>();
      for (const l of (data ?? []) as unknown as Array<{ debit: number; credit: number; account: { id: string; code: string; name: string; account_type: string } }>) {
        const k = l.account.id;
        const r = map.get(k) ?? { code: l.account.code, name: l.account.name, type: l.account.account_type, debit: 0, credit: 0 };
        r.debit += Number(l.debit); r.credit += Number(l.credit);
        map.set(k, r);
      }
      return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
    },
  });

  const rows = q.data ?? [];
  const td = rows.reduce((s, r) => s + r.debit, 0);
  const tc = rows.reduce((s, r) => s + r.credit, 0);

  return (
    <AccountingShell title="Trial Balance" breadcrumb="accounting / trial">
      <div className="mb-4"><Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">As of</Label><Input className="max-w-[200px]" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></div>
      <div className="overflow-x-auto border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            <tr><th className="px-3 py-2 text-left">Code</th><th className="px-3 py-2 text-left">Account</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No posted activity.</td></tr>}
            {rows.map((r) => (
              <tr key={r.code} className="border-t border-border/60">
                <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{ACCOUNT_TYPE_LABELS[r.type]}</td>
                <td className="px-3 py-2 text-right font-mono">{r.debit > 0 ? fmtMoney(r.debit) : ""}</td>
                <td className="px-3 py-2 text-right font-mono">{r.credit > 0 ? fmtMoney(r.credit) : ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/40 font-mono">
              <td colSpan={3} className="px-3 py-2 text-right uppercase text-xs tracking-widest text-muted-foreground">Totals</td>
              <td className="px-3 py-2 text-right">{fmtMoney(td)}</td>
              <td className="px-3 py-2 text-right">{fmtMoney(tc)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="mt-3 text-right font-mono text-xs">
        <span className={Math.abs(td - tc) < 0.01 ? "text-success" : "text-destructive"}>
          {Math.abs(td - tc) < 0.01 ? "Balanced ✓" : `Off by ${fmtMoney(Math.abs(td - tc))}`}
        </span>
      </div>
    </AccountingShell>
  );
}
