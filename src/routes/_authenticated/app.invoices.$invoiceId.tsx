import type { TablesUpdate } from "@/integrations/supabase/types";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { useOrgId } from "@/lib/crm/use-org";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Send, Save, Wallet, Copy, Ban, FileDown } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { AiBlock } from "@/components/ai/ai-block";
import { useAiEntity } from "@/lib/ai/entity-context";
import { copyDocument, replaceDocLines } from "@/lib/sales/doc-lines";
import { SendDocumentButton } from "@/components/sales/send-document-sheet";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";

type Status = Database["public"]["Enums"]["invoice_status"];
const TONE: Record<Status, BadgeTone> = {
  draft: "muted", sent: "info", partially_paid: "warning", paid: "success", overdue: "danger", void: "muted",
};

export const Route = createFileRoute("/_authenticated/app/invoices/$invoiceId")({
  head: () => ({ meta: [{ title: "Invoice" }] }),
  component: InvoiceDetail,
});

function InvoiceDetail() {
  const { invoiceId } = Route.useParams();
  const orgId = useOrgId();
  useAiEntity({ type: "invoice", id: invoiceId, label: invoiceId });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [paymentOpen, setPaymentOpen] = useState(false);

  const inv = useQuery({
    queryKey: ["invoice", invoiceId], enabled: !!invoiceId,
    queryFn: async () => (await supabase.from("invoices")
      .select("*, contacts:contact_id(id, first_name, last_name, email), companies:company_id(id, name)")
      .eq("id", invoiceId).maybeSingle()).data,
  });
  const itemsQ = useQuery({
    queryKey: ["invoice-items", invoiceId], enabled: !!invoiceId,
    queryFn: async () => rowsToItems((await supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("position")).data),
  });
  const payments = useQuery({
    queryKey: ["invoice-payments", invoiceId], enabled: !!invoiceId,
    queryFn: async () => ((await supabase.from("payments")
      .select("*, payment_methods:payment_method_id(name)")
      .eq("invoice_id", invoiceId).order("payment_date", { ascending: false })).data ?? []),
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
  const [form, setForm] = useState({ contact_id: "", company_id: "", issue_date: "", due_date: "", currency: "USD", notes: "", terms: "" });
  useEffect(() => {
    if (inv.data) setForm({
      contact_id: inv.data.contact_id ?? "", company_id: inv.data.company_id ?? "",
      issue_date: inv.data.issue_date ?? "", due_date: inv.data.due_date ?? "",
      currency: inv.data.currency ?? "USD", notes: inv.data.notes ?? "", terms: inv.data.terms ?? "",
    });
  }, [inv.data?.id]);
  useEffect(() => { if (itemsQ.data) setItems(itemsQ.data); }, [itemsQ.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("invoices").update({
        contact_id: form.contact_id || null, company_id: form.company_id || null,
        issue_date: form.issue_date || undefined, due_date: form.due_date || null,
        currency: form.currency || "USD", notes: form.notes || null, terms: form.terms || null,
      }).eq("id", invoiceId);
      if (error) throw error;
      await replaceDocLines("invoice", invoiceId, items);
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["invoice", invoiceId] }); qc.invalidateQueries({ queryKey: ["invoice-items", invoiceId] }); qc.invalidateQueries({ queryKey: ["invoices"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async (s: Status) => {
      const patch: TablesUpdate<"invoices"> = { status: s };
      if (s === "sent") patch.sent_at = new Date().toISOString();
      if (s === "void") patch.voided_at = new Date().toISOString();
      const { error } = await supabase.from("invoices").update(patch).eq("id", invoiceId);
      if (error) throw error;
    },
    onSuccess: (_d, s) => { toast.success(s === "sent" ? "Marked as sent" : s === "void" ? "Invoice voided" : "Status updated"); qc.invalidateQueries({ queryKey: ["invoice", invoiceId] }); qc.invalidateQueries({ queryKey: ["invoices"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deletePayment = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase.from("payments").delete().eq("id", paymentId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Payment deleted"); qc.invalidateQueries({ queryKey: ["invoice", invoiceId] }); qc.invalidateQueries({ queryKey: ["invoice-payments", invoiceId] }); qc.invalidateQueries({ queryKey: ["payments"] }); qc.invalidateQueries({ queryKey: ["invoices"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicate = useMutation({
    mutationFn: async () => copyDocument("invoice", invoiceId, "invoice", async () => {
      if (!inv.data) throw new Error("Not loaded");
      const { data: num } = await supabase.rpc("next_doc_number", { _org: orgId!, _doc: "invoice" });
      const { data: { user } } = await getSessionUser();
      const { data: copy, error } = await supabase.from("invoices").insert({
        org_id: orgId!, number: num as string, status: "draft",
        contact_id: inv.data.contact_id, company_id: inv.data.company_id,
        currency: inv.data.currency, notes: inv.data.notes, terms: inv.data.terms,
        created_by: user?.id, owner_id: user?.id,
      }).select("id").single();
      if (error) throw error;
      try {
        await replaceDocLines("invoice", copy.id, items);
      } catch (e) {
        await supabase.from("invoices").delete().eq("id", copy.id);
        throw e;
      }
      return copy.id as string;
    }),
    onSuccess: (id) => { toast.success("Duplicated"); navigate({ to: "/app/invoices/$invoiceId", params: { invoiceId: id } }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("invoices").delete().eq("id", invoiceId); if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); navigate({ to: "/app/invoices" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (inv.isLoading) return <SalesShell title="Invoice" breadcrumb="invoices"><Skeleton className="h-96 w-full" /></SalesShell>;
  if (!inv.data) return <SalesShell title="Invoice" breadcrumb="invoices"><div className="p-8 text-center text-muted-foreground">Not found.</div></SalesShell>;
  const i = inv.data;
  const isFinal = i.status !== "draft";

  return (
    <SalesShell title={i.number} breadcrumb={`invoices / ${i.number}`} actions={
      <Link to="/app/invoices" className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 inline size-3" /> Back
      </Link>
    }>
      <div className="mb-4"><AiBlock entityType="invoice" entityId={invoiceId} /></div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge tone={TONE[i.status]}>{i.status.replace("_", " ")}</StatusBadge>
        <span className="font-mono text-xs text-muted-foreground">
          Total {fmtMoney(i.total, i.currency)} · Paid {fmtMoney(i.amount_paid, i.currency)} · Balance {fmtMoney(i.balance_due, i.currency)}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {i.status === "draft" && <Button size="sm" variant="outline" onClick={() => setStatus.mutate("sent")}><Send className="mr-1 size-3.5" /> Mark sent</Button>}
          {(i.status === "sent" || i.status === "partially_paid" || i.status === "overdue") && Number(i.balance_due) > 0 && (
            <Button size="sm" onClick={() => setPaymentOpen(true)}><Wallet className="mr-1 size-3.5" /> Record payment</Button>
          )}
          {i.status !== "void" && (
            <SendDocumentButton doc="invoice" id={invoiceId} number={i.number} defaultTo={i.contacts?.email}
              onSent={() => { qc.invalidateQueries({ queryKey: ["invoice", invoiceId] }); qc.invalidateQueries({ queryKey: ["invoices"] }); }} />
          )}
          <Button size="sm" variant="outline" asChild><a href={`/print/invoice/${invoiceId}`} target="_blank" rel="noopener"><FileDown className="mr-1 size-3.5" /> PDF</a></Button>
          <Button size="sm" variant="outline" onClick={() => duplicate.mutate()} disabled={duplicate.isPending}><Copy className="mr-1 size-3.5" /> Duplicate</Button>
          {i.status !== "void" && i.status !== "paid" && (
            <ConfirmDelete title="Void invoice?" description="Voided invoices keep their record but stop counting toward receivables. Any posted journal is reversed." confirmLabel="Void" trigger={<Button size="sm" variant="outline"><Ban className="mr-1 size-3.5" /> Void</Button>} onConfirm={() => setStatus.mutate("void")} />
          )}
          <ConfirmDelete title="Delete invoice?" description="This permanently removes the invoice and its items." onConfirm={() => remove.mutate()} />
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
            <Field label="Issue date"><Input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} /></Field>
            <Field label="Due date"><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
            <Field label="Currency"><Input value={form.currency} maxLength={3} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></Field>
          </div>
          <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <Field label="Terms"><Textarea rows={2} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} /></Field>
        </div>
        <aside className="space-y-4">
          <div className="border border-border bg-card shadow-sm p-4">
            <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Summary</h3>
            <div className="mt-3 space-y-2 text-sm">
              <Row label="Subtotal" v={fmtMoney(i.subtotal, i.currency)} />
              <Row label="Discount" v={`− ${fmtMoney(i.discount_total, i.currency)}`} />
              <Row label="Tax" v={fmtMoney(i.tax_total, i.currency)} />
              <Row label="Total" v={fmtMoney(i.total, i.currency)} bold />
              <Row label="Paid" v={fmtMoney(i.amount_paid, i.currency)} />
              <Row label="Balance due" v={fmtMoney(i.balance_due, i.currency)} bold />
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
                      <ConfirmDelete title="Delete payment?" description="The invoice balance is recalculated and any posted journal for this payment is reversed."
                        trigger={<Button variant="bare" size="bare" type="button" className="hover:text-destructive">Delete</Button>}
                        onConfirm={() => deletePayment.mutate(p.id)} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No payments recorded.</p>
            )}
          </div>
        </aside>
      </div>

      <div className="mt-6">
        <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">Line items</h3>
        <LineItemsEditor items={items} onChange={setItems} currency={form.currency} readOnly={i.status !== "draft"} />
        {i.status !== "draft" && i.status !== "void" && (
          <p className="mt-2 text-xs text-muted-foreground">This invoice has been sent, so its lines are locked. To correct it, void it and duplicate.</p>
        )}
      </div>
      {i.status === "draft" && (
        <div className="mt-4 flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}><Save className="mr-1 size-4" /> {save.isPending ? "Saving…" : "Save"}</Button>
        </div>
      )}

      <RecordPaymentSheet open={paymentOpen} onOpenChange={setPaymentOpen} invoiceId={invoiceId} balance={Number(i.balance_due)} currency={i.currency}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["invoice", invoiceId] }); qc.invalidateQueries({ queryKey: ["invoice-payments", invoiceId] }); qc.invalidateQueries({ queryKey: ["payments"] }); }} />
      <AttachmentsPanel orgId={orgId} entityType="invoice" entityId={invoiceId} className="mt-6 border border-border bg-background" />
    </SalesShell>
  );
}

function RecordPaymentSheet({ open, onOpenChange, invoiceId, balance, currency, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; invoiceId: string; balance: number; currency: string; onSaved: () => void;
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
      const { error } = await supabase.from("payments").insert({
        org_id: orgId!, invoice_id: invoiceId, amount: form.amount, currency,
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
        <SheetHeader><SheetTitle>Record payment</SheetTitle><SheetDescription>Balance due {fmtMoney(balance, currency)}</SheetDescription></SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="mt-6 space-y-4">
          <F label="Amount"><Input type="number" min={0} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></F>
          <F label="Date"><Input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} /></F>
          <F label="Method">
            <Select value={form.payment_method_id || "none"} onValueChange={(v) => setForm({ ...form, payment_method_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {methods.data?.map((pm) => <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {(methods.data?.length ?? 0) === 0 && <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Add methods in settings (defaults supported).</p>}
          </F>
          <F label="Reference"><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="check #, txn id…" /></F>
          <F label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></F>
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
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div className="space-y-1.5"><Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>{children}</div>);
}
function Row({ label, v, bold }: { label: string; v: string; bold?: boolean }) {
  return (<div className={`flex justify-between gap-4 ${bold ? "border-t border-border pt-1 font-medium" : ""}`}>
    <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</span><span className="font-mono">{v}</span></div>);
}
