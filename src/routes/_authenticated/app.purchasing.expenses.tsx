import { createFileRoute } from "@tanstack/react-router";
import { useOpenOnNew } from "@/lib/use-focus-row";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { usePaged } from "@/lib/use-paged";
import { TablePager } from "@/components/ui/table-pager";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
import { PurchasingShell, fmtMoney } from "@/components/purchasing/purchasing-shell";
import { DataTable } from "@/components/crm/data-table";
import { EmptyState } from "@/components/crm/empty-state";
import { PageToolbar } from "@/components/crm/page-toolbar";
import { StatusBadge, type BadgeTone } from "@/components/crm/status-badge";
import { ConfirmDelete } from "@/components/crm/confirm-delete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { useOrgId } from "@/lib/crm/use-org";
import { Plus, Pencil, Trash2, Paperclip } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Expense = Database["public"]["Tables"]["expenses"]["Row"];
type Status = Database["public"]["Enums"]["expense_status"];
const TONE: Record<Status, BadgeTone> = {
  draft: "muted", submitted: "info", approved: "info", reimbursed: "success", rejected: "danger",
};
const STATUSES: Status[] = ["draft","submitted","approved","reimbursed","rejected"];

export const Route = createFileRoute("/_authenticated/app/purchasing/expenses")({
  head: () => ({ meta: [{ title: "Expenses — Purchasing" }] }),
  component: ExpensesPage,
});

type FormState = {
  expense_date: string;
  supplier_id: string;
  category_id: string;
  payment_method_id: string;
  description: string;
  amount: string;
  tax_amount: string;
  currency: string;
  status: Status;
  billable: boolean;
  billable_company_id: string;
  notes: string;
  receipt_url: string;
};

const emptyForm = (): FormState => ({
  expense_date: new Date().toISOString().slice(0,10),
  supplier_id: "", category_id: "", payment_method_id: "",
  description: "", amount: "0", tax_amount: "0", currency: "USD",
  status: "draft", billable: false, billable_company_id: "", notes: "", receipt_url: "",
});

function ExpensesPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const p = usePaged();
  const [status, setStatusRaw] = useState<string>("all");
  const [categoryFilter, setCategoryRaw] = useState<string>("all");
  const setStatus = (v: string) => { setStatusRaw(v); p.reset(); };
  const setCategoryFilter = (v: string) => { setCategoryRaw(v); p.reset(); };
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  // Paged, filtered and searched in the database: 25 rows at a time, not the whole history.
  const expenses = useQuery({
    queryKey: ["expenses", orgId, status, categoryFilter, p.q, p.page, p.size], enabled: !!orgId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from("expenses")
        .select("*, suppliers:supplier_id(id, name), categories:category_id(id, name), companies:billable_company_id(id, name)", { count: "exact" })
        .eq("org_id", orgId!).order("expense_date", { ascending: false });
      if (status !== "all") q = q.eq("status", status as Expense["status"]);
      if (categoryFilter !== "all") q = q.eq("category_id", categoryFilter);
      const term = p.q.replace(/[,()%*"\\]/g, " ").trim();
      if (term) {
        // Match the description, the supplier's name or the category's name.
        const [sup, cat] = await Promise.all([
          supabase.from("suppliers").select("id").eq("org_id", orgId!).ilike("name", `%${term}%`).limit(50),
          supabase.from("expense_categories").select("id").eq("org_id", orgId!).ilike("name", `%${term}%`).limit(50),
        ]);
        const sIds = (sup.data ?? []).map((x) => x.id), cIds = (cat.data ?? []).map((x) => x.id);
        q = q.or([`description.ilike.%${term}%`,
          ...(sIds.length ? [`supplier_id.in.(${sIds.join(",")})`] : []),
          ...(cIds.length ? [`category_id.in.(${cIds.join(",")})`] : [])].join(","));
      }
      const { data, count, error } = await q.range(p.from, p.to);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  const suppliers = useQuery({
    queryKey: ["suppliers-min", orgId], enabled: !!orgId,
    queryFn: async () => (await supabase.from("suppliers").select("id, name").eq("org_id", orgId!).eq("archived", false).order("name")).data ?? [],
  });
  const categories = useQuery({
    queryKey: ["expense-categories", orgId], enabled: !!orgId,
    queryFn: async () => (await supabase.from("expense_categories").select("id, name").eq("org_id", orgId!).eq("is_active", true).order("name")).data ?? [],
  });
  // Only the form uses these two, so they load when it opens.
  const paymentMethods = useQuery({
    queryKey: ["payment-methods", orgId], enabled: !!orgId && open,
    queryFn: async () => (await supabase.from("payment_methods").select("id, name").eq("org_id", orgId!).eq("is_active", true).order("name")).data ?? [],
  });
  const companies = useQuery({
    queryKey: ["companies-min", orgId], enabled: !!orgId && open,
    queryFn: async () => (await supabase.from("companies").select("id, name").eq("org_id", orgId!).eq("archived", false).order("name")).data ?? [],
  });

  useEffect(() => {
    if (editing) {
      setForm({
        expense_date: editing.expense_date ?? new Date().toISOString().slice(0,10),
        supplier_id: editing.supplier_id ?? "",
        category_id: editing.category_id ?? "",
        payment_method_id: editing.payment_method_id ?? "",
        description: editing.description ?? "",
        amount: String(editing.amount ?? 0),
        tax_amount: String(editing.tax_amount ?? 0),
        currency: editing.currency ?? "USD",
        status: editing.status,
        billable: editing.billable,
        billable_company_id: editing.billable_company_id ?? "",
        notes: editing.notes ?? "",
        receipt_url: editing.receipt_url ?? "",
      });
    } else setForm(emptyForm());
  }, [editing, open]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await getSessionUser();
      const payload = {
        org_id: orgId!,
        expense_date: form.expense_date,
        supplier_id: form.supplier_id || null,
        category_id: form.category_id || null,
        payment_method_id: form.payment_method_id || null,
        description: form.description,
        amount: Number(form.amount) || 0,
        tax_amount: Number(form.tax_amount) || 0,
        currency: form.currency || "USD",
        status: form.status,
        billable: form.billable,
        billable_company_id: form.billable ? (form.billable_company_id || null) : null,
        notes: form.notes || null,
        receipt_url: form.receipt_url || null,
      };
      if (editing) {
        const { error } = await supabase.from("expenses").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("expenses").insert({ ...payload, created_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(editing ? "Expense updated" : "Expense added"); qc.invalidateQueries({ queryKey: ["expenses"] }); setOpen(false); setEditing(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("expenses").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Expense deleted"); qc.invalidateQueries({ queryKey: ["expenses"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = expenses.data?.rows;

  function openNew() { setEditing(null); setOpen(true); }
  function openEdit(e: Expense) { setEditing(e); setOpen(true); }

  useOpenOnNew(openNew, !!orgId);
  return (
    <PurchasingShell title="Expenses" breadcrumb="purchasing / expenses" actions={
      <Button size="sm" onClick={openNew} disabled={!orgId}><Plus className="mr-1 size-4" /> New expense</Button>
    }>
      <PageToolbar search={p.search} onSearchChange={p.setSearch} placeholder="Search description, supplier, category…" filters={
        <>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </>
      } />

      <DataTable
        loading={expenses.isLoading}
        data={filtered}
        columns={[
          { key: "date", header: "Date", cell: (e) => <span className="font-mono text-xs">{new Date(e.expense_date).toLocaleDateString()}</span> },
          { key: "description", header: "Description", cell: (e) => <span className="truncate">{e.description || <span className="text-muted-foreground">—</span>}</span> },
          { key: "category", header: "Category", cell: (e) => e.categories?.name ?? <span className="text-muted-foreground">—</span> },
          { key: "supplier", header: "Supplier", cell: (e) => e.suppliers?.name ?? <span className="text-muted-foreground">—</span> },
          { key: "billable", header: "Billable", cell: (e) => e.billable ? <span className="font-mono text-xs uppercase tracking-widest text-primary">{e.companies?.name ?? "Yes"}</span> : <span className="text-muted-foreground">—</span> },
          { key: "total", header: "Total", cell: (e) => <span className="font-mono">{fmtMoney(e.total, e.currency)}</span> },
          { key: "status", header: "Status", cell: (e) => <StatusBadge tone={TONE[e.status as Status]}>{e.status}</StatusBadge> },
          { key: "actions", header: "", cell: (e) => (
            <div className="flex justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
              <Button aria-label="Edit expense" size="sm" variant="ghost" onClick={() => openEdit(e as Expense)}><Pencil className="size-3.5" /></Button>
              <ConfirmDelete title="Delete expense?" description="This cannot be undone." onConfirm={() => remove.mutate(e.id)}
                trigger={<Button aria-label="Delete expense" size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></Button>} />
            </div>
          ) },
        ]}
        empty={<EmptyState title="No expenses yet" description="Track business expenses, receipts, and reimbursements." action={
          <Button onClick={openNew}><Plus className="mr-1 size-4" /> New expense</Button>
        } />}
      />
      <TablePager page={p.page} size={p.size} total={expenses.data?.total ?? 0} onPage={p.setPage} onSize={p.setSize} />

      <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader><SheetTitle>{editing ? "Edit expense" : "New expense"}</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date"><Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></Field>
              <Field label="Currency"><Input value={form.currency} maxLength={3} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></Field>
            </div>
            <Field label="Description"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What was this expense for?" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount"><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
              <Field label="Tax"><Input type="number" step="0.01" value={form.tax_amount} onChange={(e) => setForm({ ...form, tax_amount: e.target.value })} /></Field>
            </div>
            <Field label="Category">
              <Select value={form.category_id || "none"} onValueChange={(v) => setForm({ ...form, category_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {categories.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Supplier / vendor">
              <Select value={form.supplier_id || "none"} onValueChange={(v) => setForm({ ...form, supplier_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Supplier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {suppliers.data?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Payment method">
              <Select value={form.payment_method_id || "none"} onValueChange={(v) => setForm({ ...form, payment_method_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Method" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {paymentMethods.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className="flex items-center justify-between border border-border bg-card px-3 py-2">
              <div>
                <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Billable to customer</Label>
                <p className="text-xs text-muted-foreground">Rebill this on a customer invoice.</p>
              </div>
              <Switch checked={form.billable} onCheckedChange={(v) => setForm({ ...form, billable: v })} />
            </div>
            {form.billable && (
              <Field label="Bill to company">
                <Select value={form.billable_company_id || "none"} onValueChange={(v) => setForm({ ...form, billable_company_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Company" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {companies.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Field label={<span className="flex items-center gap-1"><Paperclip className="size-3" /> Receipt URL <span className="text-muted-foreground">(attachment placeholder)</span></span>}>
              <Input value={form.receipt_url} onChange={(e) => setForm({ ...form, receipt_url: e.target.value })} placeholder="https://..." />
            </Field>
            <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>
          <SheetFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : (editing ? "Update" : "Create")}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </PurchasingShell>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (<div className="space-y-1.5"><Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>{children}</div>);
}
