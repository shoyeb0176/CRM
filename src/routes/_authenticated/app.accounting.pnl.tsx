import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { useOrgId } from "@/lib/crm/use-org";
import { fmtMoney, signedBalance } from "@/lib/accounting/use-accounting";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/app/accounting/pnl")({
  head: () => ({ meta: [{ title: "Profit & Loss — Accounting" }] }),
  component: PnLPage,
});

type Row = { code: string; name: string; type: string; total: number };

function PnLPage() {
  const orgId = useOrgId();
  const today = new Date().toISOString().slice(0, 10);
  const firstOfYear = new Date().getFullYear() + "-01-01";
  const [from, setFrom] = useState(firstOfYear);
  const [to, setTo] = useState(today);

  const q = useQuery({
    queryKey: ["pnl", orgId, from, to], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journal_entry_lines")
        .select("debit, credit, account:chart_of_accounts!inner(id, code, name, account_type), journal_entries!inner(status, entry_date, org_id)")
        .eq("org_id", orgId!)
        .eq("journal_entries.status", "posted")
        .gte("journal_entries.entry_date", from)
        .lte("journal_entries.entry_date", to);
      if (error) throw error;
      const map = new Map<string, Row>();
      for (const l of (data ?? []) as unknown as Array<{ debit: number; credit: number; account: { id: string; code: string; name: string; account_type: string } }>) {
        const t = l.account.account_type;
        if (t !== "revenue" && t !== "expense" && t !== "cogs") continue;
        const k = l.account.id;
        const v = signedBalance(t, Number(l.debit), Number(l.credit));
        const cur = map.get(k) ?? { code: l.account.code, name: l.account.name, type: t, total: 0 };
        cur.total += v;
        map.set(k, cur);
      }
      return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
    },
  });

  const rows = q.data ?? [];
  const revenue = rows.filter((r) => r.type === "revenue");
  const cogs = rows.filter((r) => r.type === "cogs");
  const expense = rows.filter((r) => r.type === "expense");
  const sum = (xs: Row[]) => xs.reduce((s, r) => s + r.total, 0);
  const totalRev = sum(revenue), totalCogs = sum(cogs), totalExp = sum(expense);
  const gross = totalRev - totalCogs;
  const net = gross - totalExp;

  return (
    <AccountingShell title="Profit & Loss" breadcrumb="accounting / p&l">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div><Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      <div className="overflow-hidden border border-border">
        <Section title="Revenue" rows={revenue} total={totalRev} />
        <Section title="Cost of Goods Sold" rows={cogs} total={totalCogs} />
        <div className="flex justify-between border-t border-border bg-muted/30 px-4 py-2 font-mono"><span>Gross Profit</span><span>{fmtMoney(gross)}</span></div>
        <Section title="Operating Expenses" rows={expense} total={totalExp} />
        <div className="flex justify-between border-t-2 border-border bg-muted/50 px-4 py-3 font-heading text-lg"><span>Net Income</span><span className={net >= 0 ? "text-success" : "text-destructive"}>{fmtMoney(net)}</span></div>
      </div>
    </AccountingShell>
  );
}

function Section({ title, rows, total }: { title: string; rows: Row[]; total: number }) {
  return (
    <div>
      <div className="border-b border-border bg-muted/40 px-4 py-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">{title}</div>
      {rows.length === 0 ? <div className="px-4 py-3 text-sm text-muted-foreground">—</div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="border-t border-border/60">
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground w-24">{r.code}</td>
                  <td className="px-4 py-2">{r.name}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmtMoney(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-between border-t border-border bg-muted/20 px-4 py-2 font-mono text-sm"><span>Total {title}</span><span>{fmtMoney(total)}</span></div>
    </div>
  );
}
