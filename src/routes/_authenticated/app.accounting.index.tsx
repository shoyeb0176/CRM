import { createFileRoute, Link } from "@tanstack/react-router";
import { ModuleCharts, useOverviewKpis } from "@/components/charts/module-charts";
import { KpiTile as Kpi } from "@/components/ui/kpi-tile";
import { supabase } from "@/integrations/supabase/client";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { useOrgId } from "@/lib/crm/use-org";
import { fmtMoney, signedBalance } from "@/lib/accounting/use-accounting";

export const Route = createFileRoute("/_authenticated/app/accounting/")({
  head: () => ({ meta: [{ title: "Accounting — Inuberry" }] }),
  component: AccountingOverview,
});

type Line = { debit: number; credit: number; account: { account_type: string } | null };

function AccountingOverview() {
  const orgId = useOrgId();

  // One overview call for the whole page (DB-26); these separate queries only run without it.
  const summary = useOverviewKpis("accounting", "acct-overview", async () => {
    const { data: lines } = await supabase
      .from("journal_entry_lines")
      .select("debit, credit, account:chart_of_accounts(account_type), journal_entries!inner(status, org_id)")
      .eq("org_id", orgId!)
      .eq("journal_entries.status", "posted");

    const { count: draftCount } = await supabase
      .from("journal_entries")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId!).eq("status", "draft");

    const { data: recent } = await supabase
      .from("journal_entries")
      .select("id, entry_number, entry_date, memo, status, total_debit, source")
      .eq("org_id", orgId!)
      .order("created_at", { ascending: false })
      .limit(8);

    let revenue = 0, expense = 0, asset = 0, liability = 0, equity = 0;
    for (const l of (lines ?? []) as unknown as Line[]) {
      const t = l.account?.account_type; if (!t) continue;
      const v = signedBalance(t, Number(l.debit), Number(l.credit));
      if (t === "revenue") revenue += v;
      else if (t === "expense" || t === "cogs") expense += v;
      else if (t === "asset") asset += v;
      else if (t === "liability") liability += v;
      else if (t === "equity") equity += v;
    }
    return { revenue, expense, net: revenue - expense, asset, liability, equity, draftCount: draftCount ?? 0, recent: recent ?? [] };
  });

  const s = summary.data;
  return (
    <AccountingShell title="Accounting" breadcrumb="accounting">
      <div className="mb-6"><ModuleCharts module="accounting" /></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Net income" value={fmtMoney(s?.net)} hint="Revenue − Expense" />
        <Kpi label="Revenue (posted)" value={fmtMoney(s?.revenue)} />
        <Kpi label="Expenses (posted)" value={fmtMoney(s?.expense)} />
        <Kpi label="Draft entries" value={s?.draftCount ?? 0} hint="Awaiting review" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="border border-border p-5 bg-card shadow-sm">
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Balance sheet snapshot</div>
          <dl className="mt-3 space-y-2 text-sm">
            <Row k="Assets" v={fmtMoney(s?.asset)} />
            <Row k="Liabilities" v={fmtMoney(s?.liability)} />
            <Row k="Equity" v={fmtMoney(s?.equity)} />
            <div className="mt-2 border-t border-border pt-2">
              <Row k="Equation check" v={fmtMoney((s?.asset ?? 0) - (s?.liability ?? 0) - (s?.equity ?? 0))} />
            </div>
          </dl>
        </div>

        <div className="border border-border p-5 lg:col-span-2 bg-card shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Recent journal entries</div>
            <Link to="/app/accounting/journal" className="font-mono text-xs uppercase tracking-widest text-primary hover:underline">View all</Link>
          </div>
          {(s?.recent?.length ?? 0) === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No entries yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  <tr><th className="py-2">#</th><th>Date</th><th>Memo</th><th>Source</th><th>Status</th><th className="text-right">Amount</th></tr>
                </thead>
                <tbody>
                  {s!.recent.map((e) => (
                    <tr key={e.id} className="border-t border-border/60">
                      <td className="py-2 font-mono text-xs">{e.entry_number ?? "—"}</td>
                      <td>{e.entry_date}</td>
                      <td className="max-w-[24ch] truncate">{e.memo ?? "—"}</td>
                      <td className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{e.source}</td>
                      <td>{e.status}</td>
                      <td className="text-right font-mono">{fmtMoney(Number(e.total_debit))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AccountingShell>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (<div className="flex justify-between"><dt className="text-muted-foreground">{k}</dt><dd className="font-mono">{v}</dd></div>);
}
