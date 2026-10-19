import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/crm/status-badge";
import { useAccounts, fmtMoney } from "@/lib/accounting/use-accounting";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

type Entry = {
  id: string; org_id: string; entry_number: string | null; entry_date: string;
  reference: string | null; memo: string | null; status: string; source: string;
  total_debit: number; total_credit: number; currency: string;
};
type LineRow = { id?: string; account_id: string; debit: number; credit: number; memo: string; position: number };

export const Route = createFileRoute("/_authenticated/app/accounting/journal/$entryId")({
  head: () => ({ meta: [{ title: "Journal Entry — Accounting" }] }),
  component: JournalDetailPage,
});

function JournalDetailPage() {
  const { entryId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const accounts = useAccounts();

  const entry = useQuery({
    queryKey: ["je", entryId],
    queryFn: async () => {
      const { data, error } = await supabase.from("journal_entries").select("*").eq("id", entryId).single();
      if (error) throw error;
      return data as Entry;
    },
  });

  const linesQ = useQuery({
    queryKey: ["je-lines", entryId],
    queryFn: async () => {
      const { data, error } = await supabase.from("journal_entry_lines").select("*").eq("journal_entry_id", entryId).order("position");
      if (error) throw error;
      return (data ?? []) as LineRow[];
    },
  });

  const [meta, setMeta] = useState({ entry_date: "", reference: "", memo: "" });
  const [lines, setLines] = useState<LineRow[]>([]);

  useEffect(() => {
    if (entry.data) setMeta({ entry_date: entry.data.entry_date, reference: entry.data.reference ?? "", memo: entry.data.memo ?? "" });
  }, [entry.data]);
  useEffect(() => {
    if (linesQ.data) {
      setLines(linesQ.data.length > 0
        ? linesQ.data.map((l) => ({ ...l, debit: Number(l.debit), credit: Number(l.credit) }))
        : [
          { account_id: "", debit: 0, credit: 0, memo: "", position: 1 },
          { account_id: "", debit: 0, credit: 0, memo: "", position: 2 },
        ]);
    }
  }, [linesQ.data]);

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005 && totalDebit > 0;
  const isPosted = entry.data?.status === "posted" || entry.data?.status === "reversed";

  const save = useMutation({
    mutationFn: async () => {
      if (!entry.data) throw new Error("No entry");
      const { error: e1 } = await supabase.from("journal_entries").update({
        entry_date: meta.entry_date,
        reference: meta.reference || null,
        memo: meta.memo || null,
      }).eq("id", entryId);
      if (e1) throw e1;
      const payload = lines
        .filter((l) => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0))
        .map((l, i) => ({
          account_id: l.account_id,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          memo: l.memo || null,
          position: i + 1,
        }));
      // Atomic replace on the server — lines are never left empty on failure.
      const { error: eRep } = await supabase.rpc("replace_journal_entry_lines", { _entry: entryId, _lines: payload });
      if (eRep) throw new Error(`Could not save lines: ${eRep.message}`);
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["je", entryId] }); qc.invalidateQueries({ queryKey: ["je-lines", entryId] }); qc.invalidateQueries({ queryKey: ["je"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const post = useMutation({
    mutationFn: async () => { await save.mutateAsync(); const { error } = await supabase.rpc("post_journal_entry", { _id: entryId }); if (error) throw error; },
    onSuccess: () => { toast.success("Entry posted"); qc.invalidateQueries({ queryKey: ["je", entryId] }); qc.invalidateQueries({ queryKey: ["je"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const reverse = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc("reverse_journal_entry", { _id: entryId, _memo: null } as never); if (error) throw error; },
    onSuccess: () => { toast.success("Reversed"); qc.invalidateQueries({ queryKey: ["je", entryId] }); qc.invalidateQueries({ queryKey: ["je"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("journal_entries").delete().eq("id", entryId); if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); navigate({ to: "/app/accounting/journal" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (entry.isLoading) {
    return <AccountingShell title="Journal Entry" breadcrumb="accounting / journal"><div className="py-12 text-center text-muted-foreground">Loading…</div></AccountingShell>;
  }
  if (!entry.data) {
    return <AccountingShell title="Journal Entry" breadcrumb="accounting / journal"><div className="py-12 text-center text-muted-foreground">Not found.</div></AccountingShell>;
  }

  return (
    <AccountingShell
      title={entry.data.entry_number ? `Entry ${entry.data.entry_number}` : "New Journal Entry"}
      breadcrumb="accounting / journal"
      actions={<StatusBadge tone={entry.data.status === "posted" ? "success" : entry.data.status === "reversed" ? "warning" : "muted"}>{entry.data.status}</StatusBadge>}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <F label="Entry date"><Input type="date" disabled={isPosted} value={meta.entry_date} onChange={(e) => setMeta({ ...meta, entry_date: e.target.value })} /></F>
        <F label="Reference"><Input disabled={isPosted} value={meta.reference} onChange={(e) => setMeta({ ...meta, reference: e.target.value })} maxLength={120} /></F>
        <F label="Source"><Input disabled value={entry.data.source} /></F>
      </div>
      <div className="mt-4">
        <F label="Memo"><Textarea rows={2} disabled={isPosted} value={meta.memo} onChange={(e) => setMeta({ ...meta, memo: e.target.value })} maxLength={500} /></F>
      </div>

      <div className="mt-6 overflow-x-auto border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-3 py-2 w-[40%]">Account</th>
              <th className="px-3 py-2">Memo</th>
              <th className="px-3 py-2 text-right w-[12%]">Debit</th>
              <th className="px-3 py-2 text-right w-[12%]">Credit</th>
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-2 py-1">
                  <Select disabled={isPosted} value={l.account_id || undefined} onValueChange={(v) => setLines(lines.map((x, idx) => idx === i ? { ...x, account_id: v } : x))}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      {(accounts.data ?? []).filter((a) => a.is_active).map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-2 py-1"><Input disabled={isPosted} value={l.memo} onChange={(e) => setLines(lines.map((x, idx) => idx === i ? { ...x, memo: e.target.value } : x))} /></td>
                <td className="px-2 py-1"><Input className="text-right font-mono" type="number" step="0.01" min={0} disabled={isPosted} value={l.debit} onChange={(e) => setLines(lines.map((x, idx) => idx === i ? { ...x, debit: Number(e.target.value), credit: Number(e.target.value) > 0 ? 0 : x.credit } : x))} /></td>
                <td className="px-2 py-1"><Input className="text-right font-mono" type="number" step="0.01" min={0} disabled={isPosted} value={l.credit} onChange={(e) => setLines(lines.map((x, idx) => idx === i ? { ...x, credit: Number(e.target.value), debit: Number(e.target.value) > 0 ? 0 : x.debit } : x))} /></td>
                <td className="px-2 py-1 text-right">
                  {!isPosted && lines.length > 2 && (
                    <Button aria-label="Remove line" variant="ghost" size="sm" onClick={() => setLines(lines.filter((_, idx) => idx !== i))}><Trash2 className="size-4" /></Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/30">
              <td className="px-3 py-2 font-mono text-xs uppercase tracking-widest text-muted-foreground" colSpan={2}>Totals</td>
              <td className="px-3 py-2 text-right font-mono">{fmtMoney(totalDebit, entry.data.currency)}</td>
              <td className="px-3 py-2 text-right font-mono">{fmtMoney(totalCredit, entry.data.currency)}</td>
              <td></td>
            </tr>
            <tr>
              <td className="px-3 py-2 text-right font-mono text-xs" colSpan={5}>
                <span className={balanced ? "text-success" : "text-destructive"}>
                  {balanced ? "Balanced ✓" : `Off by ${fmtMoney(Math.abs(totalDebit - totalCredit), entry.data.currency)}`}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!isPosted && (
          <Button variant="outline" size="sm" onClick={() => setLines([...lines, { account_id: "", debit: 0, credit: 0, memo: "", position: lines.length + 1 }])}>
            <Plus className="mr-1 size-4" /> Add line
          </Button>
        )}
        <div className="flex-1" />
        {entry.data.status === "draft" && (
          <>
            <Button variant="ghost" size="sm" onClick={() => remove.mutate()}>Delete</Button>
            <Button variant="outline" size="sm" onClick={() => save.mutate()} disabled={save.isPending}>Save draft</Button>
            <Button size="sm" onClick={() => post.mutate()} disabled={!balanced || post.isPending}>{post.isPending ? "Posting…" : "Post entry"}</Button>
          </>
        )}
        {entry.data.status === "posted" && (
          <Button variant="outline" size="sm" onClick={() => reverse.mutate()} disabled={reverse.isPending}>Reverse</Button>
        )}
      </div>
    </AccountingShell>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div className="space-y-1.5"><Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>{children}</div>);
}
