import type { TablesUpdate } from "@/integrations/supabase/types";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
import { PurchasingShell, fmtMoney } from "@/components/purchasing/purchasing-shell";
import { LineItemsEditor, rowsToItems, type LineItem } from "@/components/sales/line-items-editor";
import { DataTable } from "@/components/crm/data-table";
import { StatusBadge, type BadgeTone } from "@/components/crm/status-badge";
import { ConfirmDelete } from "@/components/crm/confirm-delete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgId } from "@/lib/crm/use-org";
import { ArrowLeft, CheckCircle2, Send, PackageCheck, Receipt, Save, Ban } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { replaceDocLines } from "@/lib/sales/doc-lines";

type Status = Database["public"]["Enums"]["po_status"];
const TONE: Record<Status, BadgeTone> = {
  draft: "muted", sent: "info", approved: "info", partially_received: "warning", received: "success", cancelled: "danger",
};

export const Route = createFileRoute("/_authenticated/app/purchasing/orders/$poId")({
  head: () => ({ meta: [{ title: "Purchase order — Purchasing" }] }),
  component: PODetail,
});

function PODetail() {
  const { poId } = Route.useParams();
  const orgId = useOrgId();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const po = useQuery({
    queryKey: ["po", poId], enabled: !!poId,
    queryFn: async () => (await supabase.from("purchase_orders")
      .select("*, suppliers:supplier_id(id, name), warehouses:warehouse_id(id, name)")
      .eq("id", poId).maybeSingle()).data,
  });
  const itemsQ = useQuery({
    queryKey: ["po-items", poId], enabled: !!poId,
    queryFn: async () => rowsToItems((await supabase.from("purchase_order_items").select("*").eq("purchase_order_id", poId).order("position")).data),
  });
  const suppliers = useQuery({
    queryKey: ["suppliers-min", orgId], enabled: !!orgId,
    queryFn: async () => (await supabase.from("suppliers").select("id, name").eq("org_id", orgId!).eq("archived", false).order("name")).data ?? [],
  });
  const warehouses = useQuery({
    queryKey: ["warehouses-min", orgId], enabled: !!orgId,
    queryFn: async () => (await supabase.from("warehouses").select("id, name").eq("org_id", orgId!).eq("is_active", true).order("name")).data ?? [],
  });
  const receipts = useQuery({
    queryKey: ["po-receipts", poId], enabled: !!poId,
    queryFn: async () => (await supabase.from("purchase_receipts").select("*").eq("purchase_order_id", poId).order("received_at", { ascending: false })).data ?? [],
  });

  const [items, setItems] = useState<LineItem[]>([]);
  const [form, setForm] = useState({ supplier_id: "", warehouse_id: "", order_date: "", expected_date: "", currency: "USD", reference: "", notes: "" });

  useEffect(() => {
    if (po.data) setForm({
      supplier_id: po.data.supplier_id ?? "",
      warehouse_id: po.data.warehouse_id ?? "",
      order_date: po.data.order_date ?? "",
      expected_date: po.data.expected_date ?? "",
      currency: po.data.currency ?? "USD",
      reference: po.data.reference ?? "",
      notes: po.data.notes ?? "",
    });
  }, [po.data?.id]);
  useEffect(() => { if (itemsQ.data) setItems(itemsQ.data); }, [itemsQ.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error: uErr } = await supabase.from("purchase_orders").update({
        supplier_id: form.supplier_id || null,
        warehouse_id: form.warehouse_id || null,
        order_date: form.order_date || undefined,
        expected_date: form.expected_date || null,
        currency: form.currency || "USD",
        reference: form.reference || null,
        notes: form.notes || null,
      }).eq("id", poId);
      if (uErr) throw uErr;
      await replaceDocLines("purchase_order", poId, items);
    },
    onSuccess: () => { toast.success("PO saved"); qc.invalidateQueries({ queryKey: ["po", poId] }); qc.invalidateQueries({ queryKey: ["po-items", poId] }); qc.invalidateQueries({ queryKey: ["pos"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async (s: Status) => {
      const patch: TablesUpdate<"purchase_orders"> = { status: s };
      if (s === "approved") { patch.approved_at = new Date().toISOString(); const { data: { user } } = await getSessionUser(); patch.approved_by = user?.id; }
      const { error } = await supabase.from("purchase_orders").update(patch).eq("id", poId);
      if (error) throw error;
    },
    onSuccess: (_d, s) => { toast.success(`PO ${s.replace("_"," ")}`); qc.invalidateQueries({ queryKey: ["po", poId] }); qc.invalidateQueries({ queryKey: ["pos"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const receive = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("receive_purchase_order", { _po: poId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Received — inventory updated");
      qc.invalidateQueries({ queryKey: ["po", poId] });
      qc.invalidateQueries({ queryKey: ["po-items", poId] });
      qc.invalidateQueries({ queryKey: ["po-receipts", poId] });
      qc.invalidateQueries({ queryKey: ["pos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const convertBill = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("convert_po_to_bill", { _po: poId });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => { toast.success("Vendor bill created"); navigate({ to: "/app/purchasing/bills/$billId", params: { billId: id } }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("purchase_orders").delete().eq("id", poId); if (error) throw error; },
    onSuccess: () => { toast.success("PO deleted"); navigate({ to: "/app/purchasing/orders" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (po.isLoading) return <PurchasingShell title="Purchase order" breadcrumb="purchasing / orders"><Skeleton className="h-96 w-full" /></PurchasingShell>;
  if (!po.data) return <PurchasingShell title="Purchase order" breadcrumb="purchasing / orders"><div className="p-8 text-center text-muted-foreground">PO not found.</div></PurchasingShell>;
  const p = po.data;

  return (
    <PurchasingShell title={p.po_number} breadcrumb={`purchasing / orders / ${p.po_number}`} actions={
      <Link to="/app/purchasing/orders" className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 inline size-3" /> Back
      </Link>
    }>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge tone={TONE[p.status]}>{p.status.replace("_"," ")}</StatusBadge>
        <span className="font-mono text-xs text-muted-foreground">Total {fmtMoney(p.total, p.currency)}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {p.status === "draft" && <Button size="sm" variant="outline" onClick={() => setStatus.mutate("sent")}><Send className="mr-1 size-3.5" /> Mark sent</Button>}
          {(p.status === "sent" || p.status === "draft") && <Button size="sm" variant="outline" onClick={() => setStatus.mutate("approved")}><CheckCircle2 className="mr-1 size-3.5" /> Approve</Button>}
          {p.status !== "received" && p.status !== "cancelled" && (
            <Button size="sm" variant="outline" onClick={() => receive.mutate()} disabled={receive.isPending}>
              <PackageCheck className="mr-1 size-3.5" /> {receive.isPending ? "Receiving…" : "Receive all"}
            </Button>
          )}
          {p.status !== "cancelled" && (
            <Button size="sm" variant="outline" onClick={() => convertBill.mutate()} disabled={convertBill.isPending}>
              <Receipt className="mr-1 size-3.5" /> To vendor bill
            </Button>
          )}
          {p.status !== "cancelled" && p.status !== "received" && (
            <Button size="sm" variant="outline" onClick={() => setStatus.mutate("cancelled")}><Ban className="mr-1 size-3.5" /> Cancel</Button>
          )}
          <ConfirmDelete title="Delete purchase order?" description="This cannot be undone." onConfirm={() => remove.mutate()} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-3 border border-border bg-card shadow-sm p-4 md:col-span-2">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Supplier">
              <Select value={form.supplier_id || "none"} onValueChange={(v) => setForm({ ...form, supplier_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Supplier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {suppliers.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Receiving warehouse">
              <Select value={form.warehouse_id || "none"} onValueChange={(v) => setForm({ ...form, warehouse_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Warehouse" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {warehouses.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Order date"><Input type="date" value={form.order_date} onChange={(e) => setForm({ ...form, order_date: e.target.value })} /></Field>
            <Field label="Expected"><Input type="date" value={form.expected_date} onChange={(e) => setForm({ ...form, expected_date: e.target.value })} /></Field>
            <Field label="Currency"><Input value={form.currency} maxLength={3} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></Field>
            <Field label="Reference"><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Supplier ref / quote #" /></Field>
          </div>
          <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
        <aside className="border border-border bg-card shadow-sm p-4">
          <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Summary</h3>
          <div className="mt-3 space-y-2 text-sm">
            <Row label="Subtotal" v={fmtMoney(p.subtotal, p.currency)} />
            <Row label="Discount" v={`− ${fmtMoney(p.discount_total, p.currency)}`} />
            <Row label="Tax" v={fmtMoney(p.tax_total, p.currency)} />
            <Row label="Total" v={fmtMoney(p.total, p.currency)} bold />
          </div>
        </aside>
      </div>

      <div className="mt-6">
        <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">Line items</h3>
        <LineItemsEditor items={items} onChange={setItems} currency={form.currency} />
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="mr-1 size-4" /> {save.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>

      <div className="mt-8">
        <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">Receipts</h3>
        <DataTable
          data={receipts.data}
          loading={receipts.isLoading}
          columns={[
            { key: "received_at", header: "Received", cell: (r) => <span className="font-mono text-xs">{new Date(r.received_at).toLocaleString()}</span> },
            { key: "notes", header: "Notes", cell: (r) => r.notes ?? <span className="text-muted-foreground">—</span> },
          ]}
          empty={<div className="border border-dashed border-border bg-card/30 p-8 text-center text-sm text-muted-foreground">No receipts recorded yet. Use "Receive all" to log goods received and update stock.</div>}
        />
      </div>
    </PurchasingShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div className="space-y-1.5"><Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>{children}</div>);
}
function Row({ label, v, bold }: { label: string; v: string; bold?: boolean }) {
  return (<div className={`flex justify-between gap-4 ${bold ? "border-t border-border pt-1 font-medium" : ""}`}>
    <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</span><span className="font-mono">{v}</span></div>);
}
