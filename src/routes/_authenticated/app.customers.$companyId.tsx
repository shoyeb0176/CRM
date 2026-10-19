import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Stat } from "@/components/ui/kpi-tile";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/crm/status-badge";
import { fmtMoney } from "@/components/sales/sales-shell";
import { useOrgId } from "@/lib/crm/use-org";
import { friendlyError } from "@/lib/friendly-error";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowLeft, FileText, Receipt, MessageSquare } from "lucide-react";
import { ActivityDrawer } from "@/components/crm/activity-drawer";

export const Route = createFileRoute("/_authenticated/app/customers/$companyId")({
  head: () => ({ meta: [{ title: "Customer — Inuberry" }] }),
  component: CustomerDetail,
});

const TABS = ["Contacts", "Quotes", "Orders", "Invoices", "Payments", "Projects", "Activity"] as const;
type Tab = (typeof TABS)[number];

function CustomerDetail() {
  const { companyId } = Route.useParams();
  const orgId = useOrgId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("Invoices");
  const [activityOpen, setActivityOpen] = useState(false);
  const activityEntity = useMemo(() => ({ entity_type: "company" as const, entity_id: companyId }), [companyId]);

  const data = useQuery({
    queryKey: ["customer", companyId],
    enabled: !!orgId,
    queryFn: async () => {
      const [co, contacts, quotes, orders, invoices, projects, activities] = await Promise.all([
        supabase.from("companies").select("*").eq("id", companyId).maybeSingle(),
        supabase.from("contacts").select("id, first_name, last_name, email, job_title").eq("company_id", companyId).eq("archived", false).order("created_at"),
        supabase.from("quotes").select("id, number, status, total, currency, issue_date").eq("company_id", companyId).order("created_at", { ascending: false }),
        supabase.from("sales_orders").select("id, number, status, total, currency, order_date").eq("company_id", companyId).order("created_at", { ascending: false }),
        supabase.from("invoices").select("id, number, status, total, balance_due, currency, issue_date, due_date").eq("company_id", companyId).order("created_at", { ascending: false }),
        supabase.from("projects").select("id, name, status, due_date").eq("customer_company_id", companyId).eq("archived", false).order("created_at", { ascending: false }),
        supabase.from("activities").select("id, type, title, description, due_at, completed, created_at").eq("entity_type", "company").eq("entity_id", companyId).order("created_at", { ascending: false }).limit(50),
      ]);
      for (const r of [co, contacts, quotes, orders, invoices, projects, activities]) if (r.error) throw r.error;
      const invIds = (invoices.data ?? []).map((i) => i.id);
      const payments = invIds.length
        ? await supabase.from("payments").select("id, amount, currency, payment_date, reference, invoice_id").in("invoice_id", invIds).order("payment_date", { ascending: false })
        : { data: [], error: null };
      if (payments.error) throw payments.error;
      return {
        company: co.data, contacts: contacts.data ?? [], quotes: quotes.data ?? [], orders: orders.data ?? [],
        invoices: invoices.data ?? [], projects: projects.data ?? [], activities: activities.data ?? [], payments: payments.data ?? [],
      };
    },
  });

  const d = data.data;
  const counted = (d?.invoices ?? []).filter((i) => i.status !== "draft" && i.status !== "void");
  const ccy = counted[0]?.currency ?? "USD";
  const openBalance = counted.reduce((s, i) => s + Number(i.balance_due ?? 0), 0);
  const lifetime = counted.reduce((s, i) => s + Number(i.total ?? 0), 0);
  const invNumber = new Map((d?.invoices ?? []).map((i) => [i.id, i.number]));
  const primary = d?.contacts[0];

  const createDoc = useMutation({
    mutationFn: async (kind: "quote" | "invoice") => {
      const { data: { user } } = await getSessionUser();
      const { data: num, error: nErr } = await supabase.rpc("next_doc_number", { _org: orgId!, _doc: kind });
      if (nErr || !num) throw new Error(`Couldn't generate a ${kind} number. Check Settings › Numbering.`);
      const base = { org_id: orgId!, number: num as string, status: "draft" as const, company_id: companyId, contact_id: primary?.id ?? null, created_by: user?.id, owner_id: user?.id };
      if (kind === "quote") {
        const { data: q, error } = await supabase.from("quotes").insert(base).select("id").single();
        if (error) throw error;
        return { kind, id: q.id };
      }
      const due = new Date(); due.setDate(due.getDate() + 30);
      const { data: inv, error } = await supabase.from("invoices").insert({ ...base, due_date: due.toISOString().slice(0, 10) }).select("id").single();
      if (error) throw error;
      return { kind, id: inv.id };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      if (r.kind === "quote") navigate({ to: "/app/sales/quotes/$quoteId", params: { quoteId: r.id } });
      else navigate({ to: "/app/invoices/$invoiceId", params: { invoiceId: r.id } });
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  const markCustomer = useMutation({
    mutationFn: async (on: boolean) => {
      const { error } = await supabase.from("companies").update({ status: on ? "customer" : "active" }).eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customer", companyId] }); qc.invalidateQueries({ queryKey: ["customers"] }); },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  const count: Record<Tab, number> = {
    Contacts: d?.contacts.length ?? 0, Quotes: d?.quotes.length ?? 0, Orders: d?.orders.length ?? 0,
    Invoices: d?.invoices.length ?? 0, Payments: d?.payments.length ?? 0, Projects: d?.projects.length ?? 0, Activity: d?.activities.length ?? 0,
  };

  return (
    <AppShell title={d?.company?.name ?? "Customer"} breadcrumb="customers">
      <Link to="/app/customers" className="mb-4 inline-flex items-center gap-1 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> Back to customers
      </Link>
      {data.isLoading ? <Skeleton className="h-48 w-full" /> : data.error ? (
        <div className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Couldn't load this customer: {(data.error as Error).message}</div>
      ) : !d?.company ? (
        <div className="border border-border bg-card shadow-sm p-8 text-center text-muted-foreground">Customer not found.</div>
      ) : (
        <>
          <section className="mb-6 border border-border bg-card">
            <div className="flex flex-wrap items-start justify-between gap-4 p-5">
              <div>
                <h2 className="font-display text-2xl uppercase">{d.company.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[d.company.industry, d.company.website, [d.company.city, d.company.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "No details yet"}
                </p>
                <p className="mt-1 text-sm">
                  Primary contact: {primary ? <Link to="/app/crm/contacts/$contactId" params={{ contactId: primary.id }} className="text-primary hover:underline">{[primary.first_name, primary.last_name].filter(Boolean).join(" ")}</Link> : <span className="text-muted-foreground">—</span>}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => createDoc.mutate("quote")} disabled={createDoc.isPending}><FileText className="mr-1 size-3.5" /> New quote</Button>
                <Button size="sm" onClick={() => createDoc.mutate("invoice")} disabled={createDoc.isPending}><Receipt className="mr-1 size-3.5" /> New invoice</Button>
                <Button size="sm" variant="outline" onClick={() => setActivityOpen(true)}><MessageSquare className="mr-1 size-3.5" /> Log activity</Button>
                <Button size="sm" variant="outline" asChild><Link to="/app/crm/companies/$companyId" params={{ companyId }}>Open in CRM</Link></Button>
                <Button size="sm" variant="ghost" disabled={markCustomer.isPending} onClick={() => markCustomer.mutate(d.company!.status !== "customer")}>
                  {d.company.status === "customer" ? "Unmark as customer" : "Mark as customer"}
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-px border-t border-border bg-border md:grid-cols-4">
              <Stat inGrid label="Open balance" value={fmtMoney(openBalance, ccy)} />
              <Stat inGrid label="Lifetime revenue" value={fmtMoney(lifetime, ccy)} />
              <Stat inGrid label="Invoices" value={String(counted.length)} />
              <Stat inGrid label="Open quotes" value={String(d.quotes.filter((q) => q.status === "draft" || q.status === "sent").length)} />
            </div>
          </section>

          <nav className="mb-4 flex flex-wrap border-b border-border">
            {TABS.map((t) => (
              <Button variant="bare" size="bare" key={t} type="button" onClick={() => setTab(t)}
                className={`-mb-px border-b-2 px-4 py-3 font-mono text-xs uppercase tracking-widest ${tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                {t} <span className="text-muted-foreground">{count[t]}</span>
              </Button>
            ))}
          </nav>

          {tab === "Contacts" && <List empty="No contacts at this company." rows={d.contacts.map((c) => (
            <Row key={c.id} to={<Link to="/app/crm/contacts/$contactId" params={{ contactId: c.id }} className="font-medium hover:underline">{[c.first_name, c.last_name].filter(Boolean).join(" ")}</Link>}
              meta={[c.job_title, c.email].filter(Boolean).join(" · ")} />
          ))} />}
          {tab === "Quotes" && <List empty="No quotes yet." rows={d.quotes.map((q) => (
            <Row key={q.id} to={<Link to="/app/sales/quotes/$quoteId" params={{ quoteId: q.id }} className="font-mono hover:underline">{q.number}</Link>}
              meta={q.issue_date ? new Date(q.issue_date).toLocaleDateString() : ""} status={q.status} amount={fmtMoney(q.total, q.currency)} />
          ))} />}
          {tab === "Orders" && <List empty="No sales orders yet." rows={d.orders.map((o) => (
            <Row key={o.id} to={<Link to="/app/sales/orders/$orderId" params={{ orderId: o.id }} className="font-mono hover:underline">{o.number}</Link>}
              meta={o.order_date ? new Date(o.order_date).toLocaleDateString() : ""} status={o.status} amount={fmtMoney(o.total, o.currency)} />
          ))} />}
          {tab === "Invoices" && <List empty="No invoices yet." rows={d.invoices.map((i) => (
            <Row key={i.id} to={<Link to="/app/invoices/$invoiceId" params={{ invoiceId: i.id }} className="font-mono hover:underline">{i.number}</Link>}
              meta={`Due ${i.due_date ? new Date(i.due_date).toLocaleDateString() : "—"} · balance ${fmtMoney(i.balance_due, i.currency)}`} status={i.status} amount={fmtMoney(i.total, i.currency)} />
          ))} />}
          {tab === "Payments" && <List empty="No payments recorded." rows={d.payments.map((p) => (
            <Row key={p.id} to={<Link to="/app/invoices/$invoiceId" params={{ invoiceId: p.invoice_id }} className="font-mono hover:underline">{invNumber.get(p.invoice_id) ?? "Invoice"}</Link>}
              meta={[new Date(p.payment_date).toLocaleDateString(), p.reference].filter(Boolean).join(" · ")} amount={fmtMoney(p.amount, p.currency)} />
          ))} />}
          {tab === "Projects" && <List empty="No projects for this customer." rows={d.projects.map((p) => (
            <Row key={p.id} to={<Link to="/app/projects/$projectId" params={{ projectId: p.id }} className="font-medium hover:underline">{p.name}</Link>}
              meta={p.due_date ? `Due ${new Date(p.due_date).toLocaleDateString()}` : ""} status={p.status} />
          ))} />}
          {tab === "Activity" && <List empty="No activity logged yet." rows={d.activities.map((a) => (
            <Row key={a.id} to={<span className="font-medium">{a.title}</span>}
              meta={[a.type, new Date(a.created_at).toLocaleString(), a.description].filter(Boolean).join(" · ")} status={a.completed ? "done" : undefined} />
          ))} />}
        </>
      )}
      <ActivityDrawer open={activityOpen} onOpenChange={setActivityOpen} activity={null} defaultEntity={activityEntity}
        onSaved={() => qc.invalidateQueries({ queryKey: ["customer", companyId] })} />
    </AppShell>
  );
}


function List({ rows, empty }: { rows: ReactNode[]; empty: string }) {
  if (!rows.length) return <div className="border border-border bg-card shadow-sm p-8 text-center text-sm text-muted-foreground">{empty}</div>;
  return <ul className="divide-y divide-border border border-border bg-card">{rows}</ul>;
}

const TONE: Record<string, "success" | "info" | "warning" | "danger" | "default"> = {
  paid: "success", accepted: "success", fulfilled: "success", converted: "success", completed: "success", done: "success", active: "info",
  sent: "info", confirmed: "info", partially_paid: "warning", overdue: "danger", rejected: "danger", void: "danger", cancelled: "danger",
};

function Row({ to, meta, status, amount }: { to: ReactNode; meta?: string; status?: string; amount?: string }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        {to}
        {meta && <div className="truncate text-xs text-muted-foreground">{meta}</div>}
      </div>
      {status && <StatusBadge tone={TONE[status] ?? "default"}>{status.replace("_", " ")}</StatusBadge>}
      {amount && <span className="w-28 text-right font-mono">{amount}</span>}
    </li>
  );
}
