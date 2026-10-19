import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { DataTable } from "@/components/crm/data-table";
import { EmptyState } from "@/components/crm/empty-state";
import { StatusBadge } from "@/components/crm/status-badge";
import { Button } from "@/components/ui/button";
import { useOrgId } from "@/lib/crm/use-org";
import { fmtMoney } from "@/lib/accounting/use-accounting";
import { toast } from "sonner";
import { Plus } from "lucide-react";

type Entry = {
  id: string; entry_number: string | null; entry_date: string; memo: string | null;
  reference: string | null; status: string; source: string;
  total_debit: number; total_credit: number; currency: string;
};

export const Route = createFileRoute("/_authenticated/app/accounting/journal/")({
  head: () => ({ meta: [{ title: "Journal Entries — Accounting" }] }),
  component: JournalListPage,
});

function JournalListPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();

  const entries = useQuery({
    queryKey: ["je", orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journal_entries").select("*").eq("org_id", orgId!)
        .order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("journal_entries")
        .insert({ org_id: orgId!, status: "draft", source: "manual" })
        .select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => { window.location.href = `/app/accounting/journal/${id}`; },
    onError: (e: Error) => toast.error(e.message),
  });

  const post = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.rpc("post_journal_entry", { _id: id }); if (error) throw error; },
    onSuccess: () => { toast.success("Entry posted"); qc.invalidateQueries({ queryKey: ["je"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AccountingShell title="Journal Entries" breadcrumb="accounting / journal" actions={
      <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}><Plus className="mr-1 size-4" /> New entry</Button>
    }>
      <DataTable
        loading={entries.isLoading}
        data={entries.data}
        columns={[
          { key: "num", header: "#", cell: (e) => <Link to="/app/accounting/journal/$entryId" params={{ entryId: e.id }} className="font-mono text-xs hover:underline">{e.entry_number ?? "draft"}</Link> },
          { key: "date", header: "Date", cell: (e) => <span className="font-mono text-xs">{e.entry_date}</span> },
          { key: "memo", header: "Memo", cell: (e) => <span className="max-w-[40ch] truncate">{e.memo ?? e.reference ?? "—"}</span> },
          { key: "src", header: "Source", cell: (e) => <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{e.source}</span> },
          { key: "status", header: "Status", cell: (e) => (
            <StatusBadge tone={e.status === "posted" ? "success" : e.status === "reversed" ? "warning" : "muted"}>{e.status}</StatusBadge>
          )},
          { key: "amt", header: "Amount", cell: (e) => <span className="font-mono">{fmtMoney(Number(e.total_debit), e.currency)}</span> },
          { key: "actions", header: "", cell: (e) => (
            <div className="flex justify-end gap-2">
              {e.status === "draft" && (
                <Button size="sm" variant="outline" onClick={(ev) => { ev.stopPropagation(); post.mutate(e.id); }} disabled={post.isPending}>Post</Button>
              )}
              <Link to="/app/accounting/journal/$entryId" params={{ entryId: e.id }} className="font-mono text-xs uppercase tracking-widest text-primary hover:underline">Open</Link>
            </div>
          )},
        ]}
        empty={<EmptyState title="No journal entries" description="Create a manual entry or let invoices, payments, and expenses post automatically." action={
          <Button onClick={() => create.mutate()}><Plus className="mr-1 size-4" /> New entry</Button>
        } />}
      />
    </AccountingShell>
  );
}
