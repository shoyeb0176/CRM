import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { DataTable } from "@/components/crm/data-table";
import { EmptyState } from "@/components/crm/empty-state";
import { ConfirmDelete } from "@/components/crm/confirm-delete";
import { StatusBadge } from "@/components/crm/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useOrgId } from "@/lib/crm/use-org";
import { useAccounts, ACCOUNT_TYPE_LABELS } from "@/lib/accounting/use-accounting";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";

type Account = {
  id: string; code: string; name: string; account_type: string;
  parent_id: string | null; description: string | null;
  currency: string; is_active: boolean; is_system: boolean;
};

export const Route = createFileRoute("/_authenticated/app/accounting/coa")({
  head: () => ({ meta: [{ title: "Chart of Accounts — Accounting" }] }),
  component: COAPage,
});

function COAPage() {
  const qc = useQueryClient();
  const accounts = useAccounts();
  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chart_of_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Account removed"); qc.invalidateQueries({ queryKey: ["coa"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: async (a: Account) => {
      const { error } = await supabase.from("chart_of_accounts").update({ is_active: !a.is_active }).eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["coa"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AccountingShell title="Chart of Accounts" breadcrumb="accounting / coa" actions={
      <Button size="sm" onClick={() => { setEditing(null); setDrawer(true); }}><Plus className="mr-1 size-4" /> New account</Button>
    }>
      <DataTable
        loading={accounts.isLoading}
        data={(accounts.data ?? []) as Account[]}
        onRowClick={(a) => { setEditing(a); setDrawer(true); }}
        columns={[
          { key: "code", header: "Code", cell: (a) => <span className="font-mono">{a.code}</span> },
          { key: "name", header: "Name", cell: (a) => <span className="font-medium">{a.name}</span> },
          { key: "type", header: "Type", cell: (a) => <StatusBadge tone="muted">{ACCOUNT_TYPE_LABELS[a.account_type] ?? a.account_type}</StatusBadge> },
          { key: "ccy", header: "Currency", cell: (a) => <span className="font-mono text-xs">{a.currency}</span> },
          { key: "status", header: "Status", cell: (a) => <StatusBadge tone={a.is_active ? "success" : "muted"}>{a.is_active ? "Active" : "Archived"}</StatusBadge> },
          { key: "system", header: "", cell: (a) => a.is_system ? <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">System</span> : null },
          { key: "actions", header: "", cell: (a) => (
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); archive.mutate(a); }}>{a.is_active ? "Archive" : "Restore"}</Button>
              {!a.is_system && (
                <span onClick={(e) => e.stopPropagation()}>
                  <ConfirmDelete title={`Delete ${a.code} ${a.name}?`} description="Only allowed if no journal lines reference it." onConfirm={() => remove.mutate(a.id)} />
                </span>
              )}
            </div>
          )},
        ]}
        empty={<EmptyState title="No accounts" description="Set up your chart of accounts to start posting." action={
          <Button onClick={() => { setEditing(null); setDrawer(true); }}><Plus className="mr-1 size-4" /> Add account</Button>
        } />}
      />
      <AccountDrawer open={drawer} onOpenChange={(v) => { setDrawer(v); if (!v) setEditing(null); }} account={editing} />
    </AccountingShell>
  );
}

function AccountDrawer({ open, onOpenChange, account }: { open: boolean; onOpenChange: (v: boolean) => void; account: Account | null }) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const accounts = useAccounts();
  const [form, setForm] = useState({
    code: "", name: "", account_type: "expense", parent_id: "", description: "", currency: "USD", is_active: true,
  });
  useEffect(() => {
    setForm(account
      ? { code: account.code, name: account.name, account_type: account.account_type, parent_id: account.parent_id ?? "", description: account.description ?? "", currency: account.currency, is_active: account.is_active }
      : { code: "", name: "", account_type: "expense", parent_id: "", description: "", currency: "USD", is_active: true });
  }, [account, open]);

  const m = useMutation({
    mutationFn: async () => {
      if (!form.code.trim() || !form.name.trim()) throw new Error("Code and name required");
      const payload = {
        org_id: orgId!, code: form.code.trim(), name: form.name.trim(),
        account_type: form.account_type as "asset" | "liability" | "equity" | "revenue" | "expense" | "cogs",
        parent_id: form.parent_id || null,
        description: form.description.trim() || null,
        currency: form.currency.toUpperCase(),
        is_active: form.is_active,
      };
      if (account) {
        const { error } = await supabase.from("chart_of_accounts").update(payload).eq("id", account.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("chart_of_accounts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(account ? "Updated" : "Created"); qc.invalidateQueries({ queryKey: ["coa"] }); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const parentOptions = ((accounts.data ?? []) as Account[]).filter((a) => a.account_type === form.account_type && a.id !== account?.id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle>{account ? "Edit account" : "New account"}</SheetTitle><SheetDescription>Accounts group transactions for reporting.</SheetDescription></SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <F label="Code"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="6100" maxLength={16} /></F>
            <F label="Currency"><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} maxLength={3} /></F>
          </div>
          <F label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} /></F>
          <F label="Type">
            <Select value={form.account_type} onValueChange={(v) => setForm({ ...form, account_type: v, parent_id: "" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ACCOUNT_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="Parent account (optional)">
            <Select value={form.parent_id || "__none"} onValueChange={(v) => setForm({ ...form, parent_id: v === "__none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None</SelectItem>
                {parentOptions.map((p) => <SelectItem key={p.id} value={p.id}>{p.code} · {p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="Description"><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} /></F>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: !!v })} /> Active</label>
          <SheetFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={m.isPending}>{m.isPending ? "Saving…" : "Save"}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div className="space-y-1.5"><Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>{children}</div>);
}
