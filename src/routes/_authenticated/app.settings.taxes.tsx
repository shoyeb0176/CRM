import { createFileRoute } from "@tanstack/react-router";
import { SettingsShell } from "@/components/settings/settings-shell";
import { useAdminContext, logAudit } from "@/lib/settings/use-admin";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app/settings/taxes")({
  head: () => ({ meta: [{ title: "Tax rates — Settings" }] }),
  component: TaxesPage,
});

function TaxesPage() {
  const { orgId, isAdmin } = useAdminContext();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [saving, setSaving] = useState(false);

  const taxes = useQuery({
    queryKey: ["taxes", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("taxes").select("*").eq("org_id", orgId!).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !name || rate === "") return;
    setSaving(true);
    const { error, data } = await supabase.from("taxes").insert({
      org_id: orgId, name, rate: Number(rate), is_active: true, is_default: false,
    }).select().single();
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Tax rate added");
    logAudit({ orgId, action: "tax.create", entityType: "tax", entityId: data.id, newValues: data });
    setName(""); setRate("");
    qc.invalidateQueries({ queryKey: ["taxes"] });
  }

  async function toggleActive(id: string, active: boolean) {
    const { error } = await supabase.from("taxes").update({ is_active: !active }).eq("id", id);
    if (error) return toast.error(error.message);
    logAudit({ orgId: orgId!, action: "tax.toggle_active", entityType: "tax", entityId: id, newValues: { is_active: !active } });
    qc.invalidateQueries({ queryKey: ["taxes"] });
  }

  async function makeDefault(id: string) {
    if (!orgId) return;
    await supabase.from("taxes").update({ is_default: false }).eq("org_id", orgId);
    const { error } = await supabase.from("taxes").update({ is_default: true, is_active: true }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Default tax updated");
    logAudit({ orgId, action: "tax.set_default", entityType: "tax", entityId: id });
    qc.invalidateQueries({ queryKey: ["taxes"] });
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete tax rate "${name}"?`)) return;
    const { error } = await supabase.from("taxes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Tax removed");
    logAudit({ orgId: orgId!, action: "tax.delete", entityType: "tax", entityId: id });
    qc.invalidateQueries({ queryKey: ["taxes"] });
  }

  return (
    <SettingsShell title="Tax rates" breadcrumb="settings · taxes">
      <div className="mb-6">
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Tax library</div>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Define tax rates used across quotes, sales orders, invoices, purchase orders and bills.
        </p>
      </div>

      {isAdmin && (
        <form onSubmit={create} className="mb-6 grid grid-cols-1 gap-3 border border-border bg-card shadow-sm p-4 md:grid-cols-[1fr_140px_auto]">
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. VAT 20%"
            className="border border-input bg-card shadow-xs px-3 py-2 text-sm focus:border-foreground focus:outline-none" />
          <input value={rate} onChange={(e) => setRate(e.target.value)} required type="number" step="0.01" min="0" max="100" placeholder="Rate %"
            className="border border-input bg-card shadow-xs px-3 py-2 text-sm focus:border-foreground focus:outline-none" />
          <Button variant="kitSolid" size="kit" disabled={saving} className="bg-primary px-4 py-2 text-primary-foreground hover:opacity-90">
            <Plus className="size-3.5" /> Add rate
          </Button>
        </form>
      )}

      <div className="overflow-x-auto border border-border bg-card shadow-sm [&>*]:min-w-[736px]">
        <div className="grid grid-cols-[minmax(10rem,1fr)_120px_120px_120px_120px] gap-4 border-b border-border bg-muted px-4 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <div>Name</div><div>Rate</div><div>Default</div><div>Status</div><div></div>
        </div>
        {taxes.isLoading && <div className="p-6 font-mono text-xs text-muted-foreground">Loading…</div>}
        {taxes.data?.length === 0 && <div className="p-6 font-mono text-xs text-muted-foreground">No tax rates yet.</div>}
        {taxes.data?.map((t) => (
          <div key={t.id} className="grid grid-cols-[minmax(10rem,1fr)_120px_120px_120px_120px] items-center gap-4 border-b border-border px-4 py-3 last:border-b-0">
            <div className="text-sm font-semibold">{t.name}</div>
            <div className="font-mono text-sm tabular-nums">{Number(t.rate).toFixed(2)}%</div>
            <div>
              {t.is_default ? (
                <span className="inline-flex items-center gap-1 bg-primary px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-primary-foreground">
                  <Star className="size-3" /> Default
                </span>
              ) : isAdmin ? (
                <Button variant="bare" size="bare" onClick={() => makeDefault(t.id)} className="font-mono text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground">
                  Make default
                </Button>
              ) : null}
            </div>
            <div>
              {isAdmin ? (
                <Button variant="bare" size="bare" onClick={() => toggleActive(t.id, t.is_active)}
                  className={`px-2 py-0.5 font-mono text-xs uppercase tracking-wider ${t.is_active ? "bg-primary text-primary-foreground" : "border border-border bg-background text-muted-foreground"}`}>
                  {t.is_active ? "Active" : "Inactive"}
                </Button>
              ) : (
                <span className="font-mono text-xs uppercase tracking-wider">{t.is_active ? "Active" : "Inactive"}</span>
              )}
            </div>
            <div className="flex justify-end">
              {isAdmin && !t.is_default && (
                <Button variant="bare" size="bare" aria-label="Delete tax rate" onClick={() => remove(t.id, t.name)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </SettingsShell>
  );
}
