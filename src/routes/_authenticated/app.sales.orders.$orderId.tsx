import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SalesShell, fmtMoney } from "@/components/sales/sales-shell";
import { LineItemsEditor, rowsToItems, type LineItem } from "@/components/sales/line-items-editor";
import { StatusBadge, type BadgeTone } from "@/components/crm/status-badge";
import { ConfirmDelete } from "@/components/crm/confirm-delete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgId } from "@/lib/crm/use-org";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Receipt, Save, XCircle } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { copyDocument, replaceDocLines } from "@/lib/sales/doc-lines";

type Status = Database["public"]["Enums"]["sales_order_status"];
const TONE: Record<Status, BadgeTone> = { draft: "muted", confirmed: "info", fulfilled: "success", cancelled: "danger" };

export const Route = createFileRoute("/_authenticated/app/sales/orders/$orderId")({
  head: () => ({ meta: [{ title: "Sales order" }] }),
  component: OrderDetail,
});

function OrderDetail() {
  const { orderId } = Route.useParams();
  const orgId = useOrgId();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const so = useQuery({
    queryKey: ["sales-order", orderId], enabled: !!orderId,
    queryFn: async () => (await supabase.from("sales_orders")
      .select("*, contacts:contact_id(id, first_name, last_name), companies:company_id(id, name)")
      .eq("id", orderId).maybeSingle()).data,
  });
  const itemsQ = useQuery({
    queryKey: ["so-items", orderId], enabled: !!orderId,
    queryFn: async () => rowsToItems((await supabase.from("sales_order_items").select("*").eq("sales_order_id", orderId).order("position")).data),
  });
  const contacts = useQuery({
    queryKey: ["contacts-min", orgId], enabled: !!orgId,
    queryFn: async () => (await supabase.from("contacts").select("id, first_name, last_name").eq("org_id", orgId!).eq("archived", false).order("first_name")).data ?? [],
  });
  const companies = useQuery({
    queryKey: ["companies-min", orgId], enabled: !!orgId,
    queryFn: async () => (await supabase.from("companies").select("id, name").eq("org_id", orgId!).eq("archived", false).order("name")).data ?? [],
  });

  const [items, setItems] = useState<LineItem[]>([]);
  const [form, setForm] = useState({ contact_id: "", company_id: "", order_date: "", expected_delivery: "", currency: "USD", notes: "" });
  useEffect(() => {
    if (so.data) setForm({
      contact_id: so.data.contact_id ?? "", company_id: so.data.company_id ?? "",
      order_date: so.data.order_date ?? "", expected_delivery: so.data.expected_delivery ?? "",
      currency: so.data.currency ?? "USD", notes: so.data.notes ?? "",
    });
  }, [so.data?.id]);
  useEffect(() => { if (itemsQ.data) setItems(itemsQ.data); }, [itemsQ.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("sales_orders").update({
        contact_id: form.contact_id || null, company_id: form.company_id || null,
        order_date: form.order_date || undefined, expected_delivery: form.expected_delivery || null,
        currency: form.currency || "USD", notes: form.notes || null,
      }).eq("id", orderId);
      if (error) throw error;
      await replaceDocLines("sales_order", orderId, items);
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["sales-order", orderId] }); qc.invalidateQueries({ queryKey: ["so-items", orderId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async (s: Status) => {
      if (s === "fulfilled") {
        const { error } = await supabase.rpc("fulfill_sales_order", { _so: orderId });
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("sales_orders").update({ status: s }).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: (_d, s) => {
      toast.success(s === "fulfilled" ? "Order fulfilled — stock updated" : `Order ${s}`);
      qc.invalidateQueries({ queryKey: ["sales-order", orderId] });
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
      qc.invalidateQueries({ queryKey: ["inventory-stock"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toInvoice = useMutation({
    mutationFn: async () => copyDocument("sales_order", orderId, "invoice", async () => {
      if (!so.data) throw new Error("Not loaded");
      const { data: num } = await supabase.rpc("next_doc_number", { _org: orgId!, _doc: "invoice" });
      const { data: inv, error } = await supabase.from("invoices").insert({
        org_id: orgId!, number: num as string, status: "draft",
        contact_id: so.data.contact_id, company_id: so.data.company_id,
        sales_order_id: orderId, currency: so.data.currency, notes: so.data.notes,
      }).select("id").single();
      if (error) throw error;
      try {
        await replaceDocLines("invoice", inv.id, items);
      } catch (e) {
        await supabase.from("invoices").delete().eq("id", inv.id);
        throw e;
      }
      await supabase.from("sales_orders").update({ invoice_id: inv.id }).eq("id", orderId);
      return inv.id as string;
    }),
    onSuccess: (id) => { toast.success("Invoice created"); navigate({ to: "/app/invoices/$invoiceId", params: { invoiceId: id } }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("sales_orders").delete().eq("id", orderId); if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); navigate({ to: "/app/sales/orders" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (so.isLoading) return <SalesShell title="Sales order" breadcrumb="sales / orders"><Skeleton className="h-96 w-full" /></SalesShell>;
  if (!so.data) return <SalesShell title="Sales order" breadcrumb="sales / orders"><div className="p-8 text-center text-muted-foreground">Not found.</div></SalesShell>;
  const o = so.data;

  return (
    <SalesShell title={o.number} breadcrumb={`sales / orders / ${o.number}`} actions={
      <Link to="/app/sales/orders" className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 inline size-3" /> Back
      </Link>
    }>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge tone={TONE[o.status]}>{o.status}</StatusBadge>
        <span className="font-mono text-xs text-muted-foreground">Total {fmtMoney(o.total, o.currency)}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {o.status === "draft" && <Button size="sm" variant="outline" onClick={() => setStatus.mutate("confirmed")}><CheckCircle2 className="mr-1 size-3.5" /> Confirm</Button>}
          {o.status === "confirmed" && <Button size="sm" variant="outline" onClick={() => setStatus.mutate("fulfilled")}><CheckCircle2 className="mr-1 size-3.5" /> Mark fulfilled</Button>}
          {o.status !== "cancelled" && <Button size="sm" variant="outline" onClick={() => setStatus.mutate("cancelled")}><XCircle className="mr-1 size-3.5" /> Cancel</Button>}
          <Button size="sm" variant="outline" onClick={() => toInvoice.mutate()} disabled={toInvoice.isPending}>
            <Receipt className="mr-1 size-3.5" /> To invoice
          </Button>
          <ConfirmDelete title="Delete order?" description="This cannot be undone." onConfirm={() => remove.mutate()} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-3 border border-border bg-card shadow-sm p-4 md:col-span-2">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact">
              <Select value={form.contact_id || "none"} onValueChange={(v) => setForm({ ...form, contact_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Contact" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {contacts.data?.map((c) => <SelectItem key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed"}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Company">
              <Select value={form.company_id || "none"} onValueChange={(v) => setForm({ ...form, company_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Company" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {companies.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Order date"><Input type="date" value={form.order_date} onChange={(e) => setForm({ ...form, order_date: e.target.value })} /></Field>
            <Field label="Expected delivery"><Input type="date" value={form.expected_delivery} onChange={(e) => setForm({ ...form, expected_delivery: e.target.value })} /></Field>
            <Field label="Currency"><Input value={form.currency} maxLength={3} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></Field>
          </div>
          <Field label="Notes"><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
        <aside className="border border-border bg-card shadow-sm p-4">
          <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Summary</h3>
          <div className="mt-3 space-y-2 text-sm">
            <Row label="Subtotal" v={fmtMoney(o.subtotal, o.currency)} />
            <Row label="Discount" v={`− ${fmtMoney(o.discount_total, o.currency)}`} />
            <Row label="Tax" v={fmtMoney(o.tax_total, o.currency)} />
            <Row label="Total" v={fmtMoney(o.total, o.currency)} bold />
          </div>
          {o.invoice_id && (
            <Link to="/app/invoices/$invoiceId" params={{ invoiceId: o.invoice_id }} className="mt-3 block text-center font-mono text-xs uppercase tracking-widest text-primary hover:underline">
              View invoice →
            </Link>
          )}
        </aside>
      </div>

      <div className="mt-6">
        <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">Line items</h3>
        <LineItemsEditor items={items} onChange={setItems} currency={form.currency} />
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}><Save className="mr-1 size-4" /> Save</Button>
      </div>
    </SalesShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div className="space-y-1.5"><Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>{children}</div>);
}
function Row({ label, v, bold }: { label: string; v: string; bold?: boolean }) {
  return (<div className={`flex justify-between gap-4 ${bold ? "border-t border-border pt-1 font-medium" : ""}`}>
    <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</span><span className="font-mono">{v}</span></div>);
}
