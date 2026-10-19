import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { useOrgId } from "@/lib/crm/use-org";
import { useAccounts, fmtMoney, signedBalance } from "@/lib/accounting/use-accounting";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/app/accounting/ledger")({
  head: () => ({ meta: [{ title: "General Ledger — Accounting" }] }),
  component: LedgerPage,
});

type LedgerRow = {
  id: string; debit: number; credit: number; memo: string | null;
  journal_entries: { id: string; entry_number: string | null; entry_date: string; status: string; memo: string | null; reference: string | null } | null;
};

function LedgerPage() {
  const orgId = useOrgId();
  const accounts = useAccounts();
  const [accountId, setAccountId] = useState<string>("");
  const [from, setFrom] = useState(new Date().getFullYear() + "-01-01");
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const q = useQuery({
    queryKey: ["ledger", orgId, accountId, from, to], enabled: !!orgId && !!accountId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journal_entry_lines")
        .select("id, debit, credit, memo, journal_entries!inner(id, entry_number, entry_date, status, memo, reference, org_id)")
        .eq("org_id", orgId!)
        .eq("account_id", accountId)
        .eq("journal_entries.status", "posted")
        .gte("journal_entries.entry_date", from)
        .lte("journal_entries.entry_date", to)
        .order("entry_date", { foreignTable: "journal_entries", ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as LedgerRow[];
    },
  });

  const account = (accounts.data ?? []).find((a) => a.id === accountId);
  let running = 0;
  const rows = (q.data ?? []).map((r) => {
    const v = account ? signedBalance(account.account_type, Number(r.debit), Number(r.credit)) : Number(r.debit) - Number(r.credit);
    running += v;
    return { r, running };
  });

  return (
    <AccountingShell title="General Ledger" breadcrumb="accounting / ledger">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[260px]">
          <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Account</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger><SelectValue placeholder="Pick an account" /></SelectTrigger>
            <SelectContent>
              {(accounts.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>

      {!accountId ? (
        <div className="border border-dashed border-border py-10 text-center text-sm text-muted-foreground">Select an account to view its ledger.</div>
      ) : (
        <div className="overflow-x-auto border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 font-mono text-xs uppercase tracking-widest text-muted-foreground">
              <tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Entry</th><th className="px-3 py-2 text-left">Memo</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th><th className="px-3 py-2 text-right">Balance</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No activity.</td></tr>}
              {rows.map(({ r, running }) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="px-3 py-2 font-mono text-xs">{r.journal_entries?.entry_date}</td>
                  <td className="px-3 py-2"><Link to="/app/accounting/journal/$entryId" params={{ entryId: r.journal_entries!.id }} className="font-mono text-xs hover:underline">{r.journal_entries?.entry_number ?? "—"}</Link></td>
                  <td className="px-3 py-2">{r.memo ?? r.journal_entries?.memo ?? r.journal_entries?.reference ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono">{Number(r.debit) > 0 ? fmtMoney(Number(r.debit)) : ""}</td>
                  <td className="px-3 py-2 text-right font-mono">{Number(r.credit) > 0 ? fmtMoney(Number(r.credit)) : ""}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtMoney(running)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AccountingShell>
  );
}
