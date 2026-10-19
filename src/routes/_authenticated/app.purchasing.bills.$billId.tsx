import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
import { PurchasingShell, fmtMoney } from "@/components/purchasing/purchasing-shell";
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
import { ArrowLeft, CheckCircle2, Ban, Save, Wallet } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { replaceDocLines } from "@/lib/sales/doc-lines";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";

type Status = Database["public"]["Enums"]["vendor_bill_status"];
const TONE: Record<Status, BadgeTone> = {
  draft: "muted", approved: "info", partially_paid: "warning", paid: "success", overdue: "danger", void: "muted",
};

export const Route = createFileRoute("/_authenticated/app/purchasing/bills/$billId")({
  head: () => ({ meta: [{ title: "Vendor bill — Purchasing" }] }),
  component: BillDetail,
});

function BillDetail() {
  const { billId } = Route.useParams();
  const orgId = useOrgId();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const bill = useQuery({
    queryKey: ["vendor-bill", billId], enabled: !!billId,
    queryFn: async () => (await supabase.from("vendor_bills").select("*, suppliers:supplier_id(id, name)").eq("id", billId).maybeSingle()).data,
  });
  const itemsQ = useQuery({
    queryKey: ["vendor-bill-items", billId], enabled: !!billId,
    queryFn: async () => rowsToItems((await supabase.from("vendor_bill_items").select("*").eq("vendor_bill_id", billId).order("position")).data),
  });
  const suppliers = useQuery({
    queryKey: ["suppliers-min", orgId], enabled: !!orgId,
    queryFn: async () => (await supabase.from("suppliers").select("id, name").eq("org_id", orgId!).eq("archived", false).order("name")).data ?? [],
  });

  const [items, setItems] = useState<LineItem[]>([]);
  const [form, setForm] = useState({ supplier_id: "", bill_date: "", due_date: "", currency: "USD", reference: "", notes: "" });

  useEffect(() => {
    if (bill.data) setForm({
      supplier_id: bill.data.supplier_id ?? "",
      bill_date: bill.data.bill_date ?? "",
      due_date: bill.data.due_date ?? "",
      currency: bill.data.currency ?? "USD",
      reference: bill.data.reference ?? "",
      notes: bill.data.notes ?? "",
    });
  }, [bill.data?.id]);
  useEffect(() => { if (itemsQ.data) setItems(itemsQ.data); }, [itemsQ.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error: uErr } = await supabase.from("vendor_bills").update({
        supplier_id: form.supplier_id || null,
        bill_date: form.bill_date || undefined,
        due_date: form.due_date || null,
        currency: form.currency || "USD",
        reference: form.reference || null,
        notes: form.notes || null,
      }).eq("id", billId);
      if (uErr) throw uErr;
      await replaceDocLines("vendor_bill", billId, items);
    },
    onSuccess: () => { toast.success("Bill saved"); qc.invalidateQueries({ queryKey: ["vendor-bill", billId] }); qc.invalidateQueries({ queryKey: ["vendor-bill-items", billId] }); qc.invalidateQueries({ queryKey: ["vendor-bills"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async (s: Status) => { const { error } = await supabase.from("vendor_bills").update({ status: s }).eq("id", billId); if (error) throw error; },
    onSuccess: (_d, s) => { toast.success(`Bill ${s.replace("_"," ")}`); qc.invalidateQueries({ queryKey: ["vendor-bill", billId] }); qc.invalidateQueries({ queryKey: ["vendor-bills"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("vendor_bills").delete().eq("id", billId); if (error) throw error; },
    onSuccess: () => { toast.success("Bill deleted"); navigate({ to: "/app/purchasing/bills" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [payOpen, setPayOpen] = useState(false);
  const payments = useQuery({
    queryKey: ["vendor-bill-payments", billId], enabled: !!billId,
    queryFn: async () => ((await supabase.from("vendor_bill_payments")
      .select("*, payment_methods:payment_method_id(name)")
      .eq("vendor_bill_id", billId).order("payment_date", { ascending: false })).data ?? []),
  });
  const refreshAfterPayment = () => {
    qc.invalidateQueries({ queryKey: ["vendor-bill", billId] });
    qc.invalidateQueries({ queryKey: ["vendor-bill-payments", billId] });
    qc.invalidateQueries({ queryKey: ["vendor-bills"] });
  };
  const deletePayment = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("vendor_bill_payments").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Payment deleted"); refreshAfterPayment(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (bill.isLoading) return <PurchasingShell title="Vendor bill" breadcrumb="purchasing / bills"><Skeleton className="h-96 w-full" /></PurchasingShell>;
  if (!bill.data) return <PurchasingShell title="Vendor bill" breadcrumb="purchasing / bills"><div className="p-8 text-center text-muted-foreground">Bill not found.</div></PurchasingShell>;
  const b = bill.data;

  return (
    <PurchasingShell title={b.bill_number} breadcrumb={`purchasing / bills / ${b.bill_number}`} actions={
      <Link to="/app/purchasing/bills" className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 inline size-3" /> Back
      </Link>
    }>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge tone={TONE[b.status]}>{b.status.replace("_"," ")}</StatusBadge>
        <span className="font-mono text-xs text-muted-foreground">Total {fmtMoney(b.total, b.currency)} · Balance {fmtMoney(b.balance_due, b.currency)}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {b.status === "draft" && <Button size="sm" variant="outline" onClick={() => setStatus.mutate("approved")}><CheckCircle2 className="mr-1 size-3.5" /> Approve</Button>}
          {b.status !== "paid" && b.status !== "void" && b.status !== "draft" && Number(b.balance_due) > 0 && (
            <Button size="sm" onClick={() => setPayOpen(true)}>
              <Wallet className="mr-1 size-3.5" /> Record payment
            </Button>
          )}
          {b.status !== "void" && <Button size="sm" variant="outline" onClick={() => setStatus.mutate("void")}><Ban className="mr-1 size-3.5" /> Void</Button>}
          <ConfirmDelete title="Delete vendor bill?" description="This cannot be undone." onConfirm={() => remove.mutate()} />
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
            <Field label="Reference"><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Supplier bill #" /></Field>
            <Field label="Bill date"><Input type="date" value={form.bill_date} onChange={(e) => setForm({ ...form, bill_date: e.target.value })} /></Field>
            <Field label="Due date"><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
            <Field label="Currency"><Input value={form.currency} maxLength={3} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></Field>
          </div>
          <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
        <aside className="space-y-4">
          <div className="border border-border bg-card shadow-sm p-4">
            <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Summary</h3>
            <div className="mt-3 space-y-2 text-sm">
              <Row label="Subtotal" v={fmtMoney(b.subtotal, b.currency)} />
              <Row label="Discount" v={`− ${fmtMoney(b.discount_total, b.currency)}`} />
              <Row label="Tax" v={fmtMoney(b.tax_total, b.currency)} />
              <Row label="Total" v={fmtMoney(b.total, b.currency)} bold />
              <Row label="Paid" v={fmtMoney(b.amount_paid, b.currency)} />
              <Row label="Balance" v={fmtMoney(b.balance_due, b.currency)} bold />
            </div>
          </div>
          <div className="border border-border bg-card shadow-sm p-4">
            <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Payments</h3>
            {payments.data && payments.data.length > 0 ? (
              <ul className="mt-3 divide-y divide-border text-sm">
                {payments.data.map((p) => (
                  <li key={p.id} className="py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs">{new Date(p.payment_date).toLocaleDateString()}</span>
                      <span className="font-mono">{fmtMoney(p.amount, p.currency)}</span>
                    </div>
                    <div className="flex items-center justify-between font-mono text-xs uppercase tracking-widest text-muted-foreground">
                      <span>{p.payment_methods?.name ?? "—"}{p.reference ? ` · ${p.reference}` : ""}</span>
                      <ConfirmDelete title="Delete payment?" description="The bill balance is recalculated and any posted journal for this payment is reversed."
                        trigger={<Button variant="bare" size="bare" type="button" className="hover:text-destructive">Delete</Button>}
                        onConfirm={() => deletePayment.mutate(p.id)} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 text-sm text-muted-foreground">No payments recorded.</p>}
          </div>
        </aside>
      </div>

      <div className="mt-6">
        <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">Line items</h3>
        <LineItemsEditor items={items} onChange={setItems} currency={form.currency} readOnly={b.status !== "draft"} />
        {b.status !== "draft" && b.status !== "void" && (
          <p className="mt-2 text-xs text-muted-foreground">This bill is approved, so its lines are locked. To correct it, void it and create a new bill.</p>
        )}
      </div>

      {b.status === "draft" && (
        <div className="mt-4 flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="mr-1 size-4" /> {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      )}
      <BillPaymentSheet open={payOpen} onOpenChange={setPayOpen} billId={billId} balance={Number(b.balance_due)} currency={b.currency} onSaved={refreshAfterPayment} />
      <AttachmentsPanel orgId={orgId} entityType="vendor_bill" entityId={billId} className="mt-6 border border-border bg-background" />
    </PurchasingShell>
  );
}

function BillPaymentSheet({ open, onOpenChange, billId, balance, currency, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; billId: string; balance: number; currency: string; onSaved: () => void;
}) {
  const orgId = useOrgId();
  const [form, setForm] = useState({ amount: balance, payment_date: new Date().toISOString().slice(0, 10), payment_method_id: "", reference: "", notes: "" });
  useEffect(() => { setForm((f) => ({ ...f, amount: balance, payment_date: new Date().toISOString().slice(0, 10) })); }, [open, balance]);
  const methods = useQuery({
    queryKey: ["payment-methods", orgId], enabled: !!orgId && open,
    queryFn: async () => ((await supabase.from("payment_methods").select("*").eq("org_id", orgId!).eq("is_active", true).order("name")).data ?? []),
  });
  const m = useMutation({
    mutationFn: async () => {
      if (!form.amount || form.amount <= 0) throw new Error("Amount must be > 0");
      if (form.amount > balance + 0.004) throw new Error(`Payment can't exceed the balance due (${fmtMoney(balance, currency)})`);
      const { data: { user } } = await getSessionUser();
      const { error } = await supabase.from("vendor_bill_payments").insert({
        org_id: orgId!, vendor_bill_id: billId, amount: form.amount, currency,
        payment_date: form.payment_date, payment_method_id: form.payment_method_id || null,
        reference: form.reference || null, notes: form.notes || null, created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Payment recorded"); onSaved(); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>Record bill payment</SheetTitle><SheetDescription>Balance due {fmtMoney(balance, currency)}</SheetDescription></SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="mt-6 space-y-4">
          <Field label="Amount"><Input type="number" min={0} max={balance} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></Field>
          <Field label="Date"><Input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} /></Field>
          <Field label="Method">
            <Select value={form.payment_method_id || "none"} onValueChange={(v) => setForm({ ...form, payment_method_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {methods.data?.map((pm) => <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Reference"><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="check #, txn id…" /></Field>
          <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <SheetFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={m.isPending}>{m.isPending ? "Saving…" : "Record"}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div className="space-y-1.5"><Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>{children}</div>);
}
function Row({ label, v, bold }: { label: string; v: string; bold?: boolean }) {
  return (<div className={`flex justify-between gap-4 ${bold ? "border-t border-border pt-1 font-medium" : ""}`}>
    <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</span><span className="font-mono">{v}</span></div>);
}
