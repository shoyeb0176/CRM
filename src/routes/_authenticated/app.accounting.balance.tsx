import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { useOrgId } from "@/lib/crm/use-org";
import { fmtMoney, signedBalance } from "@/lib/accounting/use-accounting";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/app/accounting/balance")({
  head: () => ({ meta: [{ title: "Balance Sheet — Accounting" }] }),
  component: BalancePage,
});

type Row = { code: string; name: string; type: string; total: number };

function BalancePage() {
  const orgId = useOrgId();
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));

  const q = useQuery({
    queryKey: ["balance", orgId, asOf], enabled: !!orgId,
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
        const t = l.account.account_type;
        const k = l.account.id;
        const v = signedBalance(t, Number(l.debit), Number(l.credit));
        const cur = map.get(k) ?? { code: l.account.code, name: l.account.name, type: t, total: 0 };
        cur.total += v;
        map.set(k, cur);
      }
      // include retained earnings = net income to date
      let net = 0;
      for (const r of map.values()) {
        if (r.type === "revenue" || r.type === "expense" || r.type === "cogs") net += r.type === "revenue" ? r.total : -r.total;
      }
      return { rows: [...map.values()], retained: net };
    },
  });

  const rows = q.data?.rows ?? [];
  const assets = rows.filter((r) => r.type === "asset");
  const liabilities = rows.filter((r) => r.type === "liability");
  const equity = rows.filter((r) => r.type === "equity");
  const sum = (xs: Row[]) => xs.reduce((s, r) => s + r.total, 0);
  const totalA = sum(assets), totalL = sum(liabilities), totalE = sum(equity) + (q.data?.retained ?? 0);

  return (
    <AccountingShell title="Balance Sheet" breadcrumb="accounting / balance">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div><Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">As of</Label><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Assets" rows={assets} total={totalA} />
        <div className="space-y-4">
          <Section title="Liabilities" rows={liabilities} total={totalL} />
          <Section title="Equity" rows={[...equity, { code: "—", name: "Retained earnings (period)", type: "equity", total: q.data?.retained ?? 0 }]} total={totalE} />
          <div className="flex justify-between border border-border bg-muted/40 px-4 py-3 font-mono">
            <span>Liabilities + Equity</span><span>{fmtMoney(totalL + totalE)}</span>
          </div>
        </div>
      </div>
      <div className="mt-4 border border-border bg-muted/20 px-4 py-3 font-mono text-sm">
        Check: Assets {fmtMoney(totalA)} vs Liab+Equity {fmtMoney(totalL + totalE)} → <span className={Math.abs(totalA - (totalL + totalE)) < 0.01 ? "text-success" : "text-destructive"}>{Math.abs(totalA - (totalL + totalE)) < 0.01 ? "balanced" : `off ${fmtMoney(totalA - (totalL + totalE))}`}</span>
      </div>
    </AccountingShell>
  );
}

function Section({ title, rows, total }: { title: string; rows: Row[]; total: number }) {
  return (
    <div className="overflow-x-auto border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-muted/40 px-4 py-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">{title}</div>
      {rows.length === 0 ? <div className="px-4 py-3 text-sm text-muted-foreground">—</div> : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.code + r.name} className="border-t border-border/60">
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground w-24">{r.code}</td>
                <td className="px-4 py-2">{r.name}</td>
                <td className="px-4 py-2 text-right font-mono">{fmtMoney(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex justify-between border-t border-border bg-muted/20 px-4 py-2 font-mono"><span>Total {title}</span><span>{fmtMoney(total)}</span></div>
    </div>
  );
}
