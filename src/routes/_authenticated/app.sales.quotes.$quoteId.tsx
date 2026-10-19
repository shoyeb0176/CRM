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
import { useOrgId } from "@/lib/crm/use-org";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Send, CheckCircle2, FileText, Receipt, Save, FileDown } from "lucide-react";
import { copyDocument, replaceDocLines } from "@/lib/sales/doc-lines";
import type { Database } from "@/integrations/supabase/types";
import { SendDocumentButton } from "@/components/sales/send-document-sheet";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";

type Status = Database["public"]["Enums"]["quote_status"];
const TONE: Record<Status, BadgeTone> = {
  draft: "muted", sent: "info", accepted: "success", rejected: "danger", expired: "warning", converted: "success",
};

export const Route = createFileRoute("/_authenticated/app/sales/quotes/$quoteId")({
  head: () => ({ meta: [{ title: "Quote — Sales" }] }),
  component: QuoteDetail,
});

function QuoteDetail() {
  const { quoteId } = Route.useParams();
  const orgId = useOrgId();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const quote = useQuery({
    queryKey: ["quote", quoteId], enabled: !!quoteId,
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes")
        .select("*, contacts:contact_id(id, first_name, last_name, email), companies:company_id(id, name)")
        .eq("id", quoteId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const itemsQ = useQuery({
    queryKey: ["quote-items", quoteId], enabled: !!quoteId,
    queryFn: async () => {
      const { data, error } = await supabase.from("quote_items").select("*").eq("quote_id", quoteId).order("position");
      if (error) throw error;
      return rowsToItems(data);
    },
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
  const [form, setForm] = useState({ contact_id: "", company_id: "", issue_date: "", expiry_date: "", currency: "USD", notes: "", terms: "", status: "draft" as Status });

  useEffect(() => {
    if (quote.data) {
      setForm({
        contact_id: quote.data.contact_id ?? "",
        company_id: quote.data.company_id ?? "",
        issue_date: quote.data.issue_date ?? "",
        expiry_date: quote.data.expiry_date ?? "",
        currency: quote.data.currency ?? "USD",
        notes: quote.data.notes ?? "",
        terms: quote.data.terms ?? "",
        status: quote.data.status,
      });
    }
  }, [quote.data?.id]);
  useEffect(() => { if (itemsQ.data) setItems(itemsQ.data); }, [itemsQ.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error: uErr } = await supabase.from("quotes").update({
        contact_id: form.contact_id || null,
        company_id: form.company_id || null,
        issue_date: form.issue_date || undefined,
        expiry_date: form.expiry_date || null,
        currency: form.currency || "USD",
        notes: form.notes || null,
        terms: form.terms || null,
      }).eq("id", quoteId);
      if (uErr) throw uErr;
      await replaceDocLines("quote", quoteId, items);
    },
    onSuccess: () => { toast.success("Quote saved"); qc.invalidateQueries({ queryKey: ["quote", quoteId] }); qc.invalidateQueries({ queryKey: ["quote-items", quoteId] }); qc.invalidateQueries({ queryKey: ["quotes"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async (s: Status) => {
      const { error } = await supabase.from("quotes").update({ status: s }).eq("id", quoteId);
      if (error) throw error;
    },
    onSuccess: (_d, s) => { toast.success(`Quote marked ${s}`); qc.invalidateQueries({ queryKey: ["quote", quoteId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const convertToOrder = useMutation({
    mutationFn: async () => copyDocument("quote", quoteId, "sales_order", async () => {
      if (!quote.data) throw new Error("Quote not loaded");
      const { data: num } = await supabase.rpc("next_doc_number", { _org: orgId!, _doc: "sales_order" });
      const { data: { user } } = await getSessionUser();
      const { data: so, error } = await supabase.from("sales_orders").insert({
        org_id: orgId!, number: num as string, status: "draft", created_by: user?.id, owner_id: user?.id,
        contact_id: quote.data.contact_id, company_id: quote.data.company_id,
        quote_id: quoteId, currency: quote.data.currency, notes: quote.data.notes,
      }).select("id").single();
      if (error) throw error;
      try {
        await replaceDocLines("sales_order", so.id, items);
      } catch (e) {
        await supabase.from("sales_orders").delete().eq("id", so.id);
        throw e;
      }
      await supabase.from("quotes").update({ status: "converted", converted_sales_order_id: so.id }).eq("id", quoteId);
      return so.id as string;
    }),
    onSuccess: (id) => { toast.success("Converted to sales order"); navigate({ to: "/app/sales/orders/$orderId", params: { orderId: id } }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const convertToInvoice = useMutation({
    mutationFn: async () => copyDocument("quote", quoteId, "invoice", async () => {
      if (!quote.data) throw new Error("Quote not loaded");
      const { data: num } = await supabase.rpc("next_doc_number", { _org: orgId!, _doc: "invoice" });
      const { data: { user } } = await getSessionUser();
      const { data: inv, error } = await supabase.from("invoices").insert({
        org_id: orgId!, number: num as string, status: "draft", created_by: user?.id, owner_id: user?.id,
        contact_id: quote.data.contact_id, company_id: quote.data.company_id,
        quote_id: quoteId, currency: quote.data.currency, notes: quote.data.notes, terms: quote.data.terms,
      }).select("id").single();
      if (error) throw error;
      try {
        await replaceDocLines("invoice", inv.id, items);
      } catch (e) {
        await supabase.from("invoices").delete().eq("id", inv.id);
        throw e;
      }
      await supabase.from("quotes").update({ status: "converted", converted_invoice_id: inv.id }).eq("id", quoteId);
      return inv.id as string;
    }),
    onSuccess: (id) => { toast.success("Converted to invoice"); navigate({ to: "/app/invoices/$invoiceId", params: { invoiceId: id } }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("quotes").delete().eq("id", quoteId); if (error) throw error; },
    onSuccess: () => { toast.success("Quote deleted"); navigate({ to: "/app/sales/quotes" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (quote.isLoading) return <SalesShell title="Quote" breadcrumb="sales / quotes"><Skeleton className="h-96 w-full" /></SalesShell>;
  if (!quote.data) return <SalesShell title="Quote" breadcrumb="sales / quotes"><div className="p-8 text-center text-muted-foreground">Quote not found.</div></SalesShell>;

  const q = quote.data;
  return (
    <SalesShell
      title={q.number}
      breadcrumb={`sales / quotes / ${q.number}`}
      actions={
        <div className="flex items-center gap-2">
          <Link to="/app/sales/quotes" className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1 inline size-3" /> Back
          </Link>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge tone={TONE[q.status]}>{q.status}</StatusBadge>
        <span className="font-mono text-xs text-muted-foreground">Total {fmtMoney(q.total, q.currency)}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <SendDocumentButton doc="quote" id={quoteId} number={q.number} defaultTo={q.contacts?.email}
            onSent={() => { qc.invalidateQueries({ queryKey: ["quote", quoteId] }); qc.invalidateQueries({ queryKey: ["quotes"] }); }} />
          {q.status === "draft" && <Button size="sm" variant="outline" onClick={() => setStatus.mutate("sent")}><Send className="mr-1 size-3.5" /> Mark sent</Button>}
          {q.status === "sent" && <>
            <Button size="sm" variant="outline" onClick={() => setStatus.mutate("accepted")}><CheckCircle2 className="mr-1 size-3.5" /> Accepted</Button>
            <Button size="sm" variant="outline" onClick={() => setStatus.mutate("rejected")}>Rejected</Button>
          </>}
          {q.status !== "converted" && <>
            <Button size="sm" variant="outline" onClick={() => convertToOrder.mutate()} disabled={convertToOrder.isPending}>
              <FileText className="mr-1 size-3.5" /> To sales order
            </Button>
            <Button size="sm" variant="outline" onClick={() => convertToInvoice.mutate()} disabled={convertToInvoice.isPending}>
              <Receipt className="mr-1 size-3.5" /> To invoice
            </Button>
          </>}
          <ConfirmDelete title="Delete quote?" description="This cannot be undone." onConfirm={() => remove.mutate()} />
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
                  {contacts.data?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed"}</SelectItem>
                  ))}
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
            <Field label="Expiry"><Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></Field>
            <Field label="Currency"><Input value={form.currency} maxLength={3} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></Field>
          </div>
          <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <Field label="Terms"><Textarea rows={2} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} /></Field>
        </div>
        <aside className="border border-border bg-card shadow-sm p-4">
          <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Summary</h3>
          <div className="mt-3 space-y-2 text-sm">
            <Row label="Subtotal" v={fmtMoney(q.subtotal, q.currency)} />
            <Row label="Discount" v={`− ${fmtMoney(q.discount_total, q.currency)}`} />
            <Row label="Tax" v={fmtMoney(q.tax_total, q.currency)} />
            <Row label="Total" v={fmtMoney(q.total, q.currency)} bold />
          </div>
          <Button className="mt-4 w-full" asChild><a href={`/print/quote/${quoteId}`} target="_blank" rel="noopener"><FileDown className="mr-1 size-4" /> Export PDF</a></Button>
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
      <AttachmentsPanel orgId={orgId} entityType="quote" entityId={quoteId} className="mt-6 border border-border bg-background" />
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
