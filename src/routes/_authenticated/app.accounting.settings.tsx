import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { useOrgId } from "@/lib/crm/use-org";
import { useAccounts } from "@/lib/accounting/use-accounting";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/accounting/settings")({
  head: () => ({ meta: [{ title: "Accounting Settings" }] }),
  component: SettingsPage,
});

type S = {
  default_ar_account_id: string | null; default_ap_account_id: string | null;
  default_cash_account_id: string | null; default_revenue_account_id: string | null;
  default_tax_payable_account_id: string | null; default_expense_account_id: string | null;
  default_cogs_account_id: string | null;
  auto_post_invoices: boolean; auto_post_payments: boolean; auto_post_expenses: boolean;
  auto_post_bills?: boolean; // present once migration 0021 is applied
};

const FIELDS: Array<[keyof S, string, string[]]> = [
  ["default_cash_account_id", "Default cash / bank", ["asset"]],
  ["default_ar_account_id", "Accounts receivable", ["asset"]],
  ["default_ap_account_id", "Accounts payable", ["liability"]],
  ["default_tax_payable_account_id", "Tax payable", ["liability"]],
  ["default_revenue_account_id", "Default revenue", ["revenue"]],
  ["default_expense_account_id", "Default expense", ["expense"]],
  ["default_cogs_account_id", "Cost of goods sold", ["cogs"]],
];

function SettingsPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const accounts = useAccounts();

  const q = useQuery({
    queryKey: ["acct-settings", orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("accounting_settings").select("*").eq("org_id", orgId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState<S>({
    default_ar_account_id: null, default_ap_account_id: null, default_cash_account_id: null,
    default_revenue_account_id: null, default_tax_payable_account_id: null,
    default_expense_account_id: null, default_cogs_account_id: null,
    auto_post_invoices: false, auto_post_payments: false, auto_post_expenses: false,
  });

  useEffect(() => { if (q.data) setForm(q.data as S); }, [q.data]);

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("accounting_settings").upsert({ org_id: orgId!, ...form });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["acct-settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AccountingShell title="Accounting Settings" breadcrumb="accounting / settings">
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="max-w-2xl space-y-6">
        <div className="border border-border p-5 bg-card shadow-sm">
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Default accounts</div>
          <p className="mt-1 text-sm text-muted-foreground">Used by automatic postings from invoices, bills, payments, and expenses.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {FIELDS.map(([key, label, types]) => {
              const opts = (accounts.data ?? []).filter((a) => types.includes(a.account_type) && a.is_active);
              return (
                <div key={key} className="space-y-1.5">
                  <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>
                  <Select value={form[key] as string ?? "__none"} onValueChange={(v) => setForm({ ...form, [key]: v === "__none" ? null : v })}>
                    <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Not set</SelectItem>
                      {opts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border border-border p-5 space-y-3 bg-card shadow-sm">
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Automatic postings</div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.auto_post_invoices} onCheckedChange={(v) => setForm({ ...form, auto_post_invoices: !!v })} /> Post invoices automatically</label>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.auto_post_payments} onCheckedChange={(v) => setForm({ ...form, auto_post_payments: !!v })} /> Post payments automatically</label>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.auto_post_expenses} onCheckedChange={(v) => setForm({ ...form, auto_post_expenses: !!v })} /> Post expenses automatically</label>
          {form.auto_post_bills !== undefined && (
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.auto_post_bills} onCheckedChange={(v) => setForm({ ...form, auto_post_bills: !!v })} /> Post vendor bills automatically when approved</label>
          )}
        </div>

        <Button type="submit" disabled={m.isPending}>{m.isPending ? "Saving…" : "Save settings"}</Button>
      </form>
    </AccountingShell>
  );
}
