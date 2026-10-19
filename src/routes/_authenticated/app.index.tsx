import { toast } from "sonner";
import { useChecklist } from "@/lib/checklists";
import { createFileRoute, Link } from "@tanstack/react-router";
import { startTour } from "@/components/app/tour";
import { SponsorOffers } from "@/components/billing/sponsor-offers";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Boxes, Building2, CheckCircle2, Circle, Handshake,
  PlugZap, Receipt, ShoppingBasket, UserPlus, Wallet, X,
} from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/app/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentMembership } from "@/lib/use-current-org";
import { useOrgId } from "@/lib/crm/use-org";
import { useCurrentUser } from "@/lib/use-current-user";
import { ChartEmpty, ChartSkeleton, Panel, money, monthLabel } from "@/components/charts/chart-kit";
import { Donut, RankList, SegmentBar, TrendArea } from "@/components/charts/charts";
import { ModuleCharts, useModuleSummary, type SummaryModule } from "@/components/charts/module-charts";
import { moduleShown } from "@/components/app/nav";
import { KpiCard, changeBadge, type KpiBadge } from "@/components/charts/kpi-card";
import { supabase } from "@/integrations/supabase/client";

import { SectionTitle } from "@/components/ui/section-title";
export const Route = createFileRoute("/_authenticated/app/")({
  validateSearch: (s: Record<string, unknown>) => (s.welcome !== undefined ? { welcome: "1" } : {}) as { welcome?: string },
  component: DashboardPage,
});

/** What dashboard_overview (DB-26) adds to dashboard_summary. */
type DashExtras = {
  stages?: Array<Record<string, number | string>>;
  recentActs: Array<{ id: string; type: string; title: string; completed: boolean; created_at: string }>;
  recentPayments: Array<{ id: string; amount: number; currency: string; payment_date: string; invoices: { id: string; number: string; companies: { name: string } | null } | null }>;
  recentPOs: Array<{ id: string; po_number: string; total: number; status: string; created_at: string; suppliers: { name: string } | null }>;
  setup?: { details: boolean; members: number; companies: number; apps: number; quotes?: number; sentQuotes?: number; invoices?: number; payments?: number };
};

type Summary = {
  cash: Array<{ month: string; in: number; out: number }>;
  pipeline: Array<{ stage: string; value: number }>;
  pipelineTotal: number; openDeals: number; byStatus: Record<string, number>;
  topCustomers: Array<{ name: string; value: number }>;
  outstanding: number; overdue: number; low: number; out: number; overdueTasks: number;
};

/** People with one job see that job's charts first; everyone else sees the business overview. */
const ROLE_CHARTS: Record<string, SummaryModule[]> = {
  sales_rep: ["crm", "sales"],
  accountant: ["accounting", "sales"],
  inventory_manager: ["inventory", "purchasing"],
  hr_manager: ["hr", "projects"],
};

// Invoice statuses in the order they happen; colours come from the shared status colours.
const INVOICE_STATUS = ["draft", "sent", "partially_paid", "overdue", "paid"];

function DashboardPage() {
  const membership = useCurrentMembership().membership;
  const org = membership?.organizations;
  const roleCharts = ROLE_CHARTS[membership?.role ?? ""];
  const ccy = org?.default_currency ?? "USD";
  const orgId = useOrgId();
  const { welcome } = Route.useSearch();

  const data = useQuery({
    queryKey: ["dashboard", orgId], enabled: !!orgId,
    // Always re-asked when the dashboard opens (the saved copy shows meanwhile), so a step you just
    // finished elsewhere ticks off in the checklists straight away.
    staleTime: 0,
    queryFn: async () => {
      // One call (DB-26). Before it's applied, the summary and three lists come separately.
      const ov = await supabase.rpc("dashboard_overview", { _org: orgId! });
      if (ov.error && ov.error.code !== "PGRST202" && ov.error.code !== "42883") throw ov.error;
      const one = ov.error ? null : (ov.data as unknown as Summary & DashExtras);
      const [summary, recentActs, recentPayments, recentPOs] = one
        ? [{ data: one, error: null }, { data: one.recentActs }, { data: one.recentPayments }, { data: one.recentPOs }] as const
        : await Promise.all([
        supabase.rpc("dashboard_summary", { _org: orgId! }),
        supabase.from("activities").select("id, type, title, completed, created_at").eq("org_id", orgId!).order("created_at", { ascending: false }).limit(5),
        supabase.from("payments").select("id, amount, currency, payment_date, invoices:invoice_id(id, number, companies:company_id(name))").eq("org_id", orgId!).order("payment_date", { ascending: false }).limit(5),
        supabase.from("purchase_orders").select("id, po_number, total, status, created_at, suppliers:supplier_id(name)").eq("org_id", orgId!).order("created_at", { ascending: false }).limit(5),
      ]);
      if (summary.error) throw summary.error;
      const t = summary.data as unknown as Summary;
      return {
        ...t,
        cash: t.cash.map((c) => ({ month: monthLabel(c.month), in: Number(c.in), out: Number(c.out) })),
        pipeline: t.pipeline.map((p) => ({ stage: p.stage, value: Number(p.value) })),
        byStatus: INVOICE_STATUS.map((key) => ({ key, value: Number(t.byStatus[key] ?? 0) })).filter((st) => st.value > 0),
        topCustomers: t.topCustomers.map((c) => ({ name: c.name, value: Number(c.value) })),
        pipelineTotal: Number(t.pipelineTotal), outstanding: Number(t.outstanding),
        recentActs: recentActs.data ?? [], recentPayments: recentPayments.data ?? [], recentPOs: recentPOs.data ?? [],
        stages: one?.stages, setup: one?.setup,
      };
    },
  });

  const d = data.data;
  // Stages come with the dashboard call; only without DB-26 is the CRM summary asked for.
  const crm = useModuleSummary("crm", !!d && !d.stages);
  const stages = (d?.stages ?? crm.data?.stages ?? []).map((x) => ({ label: String(x.label), value: Number(x.value) || 0, count: Number(x.count) || 0 }));
  const thisMonth = d?.cash.at(-1), lastMonth = d?.cash.at(-2);
  // Cash in and spent have six months of history, so they show a trend and the change since last
  // month. The others have no history yet, so they show what makes them up and a count instead.
  const count = (n: number, word: string, bad = true): KpiBadge => ({ text: `${n} ${word}`, tone: n && bad ? "bad" : "neutral" });
  const kpis: Array<Parameters<typeof KpiCard>[0]> = [
    { label: "Cash in this month", value: d ? money(thisMonth!.in, ccy) : null, icon: Receipt, color: "var(--success)", to: "/app/sales/payments",
      badge: d ? changeBadge(thisMonth!.in, lastMonth!.in, "up") : undefined, trend: d?.cash.map((c) => c.in) },
    { label: "Owed to you", value: d ? money(d.outstanding, ccy) : null, icon: Wallet, color: "var(--info)", to: "/app/invoices",
      badge: d ? count(d.overdue, "overdue") : undefined,
      bars: d ? ["sent", "partially_paid", "overdue"].map((k) => d.byStatus.find((st) => st.key === k)?.value ?? 0) : undefined },
    { label: "Open pipeline", value: d ? money(d.pipelineTotal, ccy) : null, icon: Handshake, color: "var(--chart-2)", to: "/app/crm/deals",
      badge: d ? count(d.openDeals, d.openDeals === 1 ? "deal" : "deals", false) : undefined, bars: d?.pipeline.map((p) => p.value) },
    { label: "Spent this month", value: d ? money(thisMonth!.out, ccy) : null, icon: ShoppingBasket, color: "var(--chart-1)", to: "/app/purchasing/expenses",
      badge: d ? changeBadge(thisMonth!.out, lastMonth!.out, "down") : undefined, trend: d?.cash.map((c) => c.out) },
    { label: "Stock to reorder", value: d ? String(d.low + d.out) : null, icon: Boxes, color: "var(--warning)", to: "/app/inventory",
      badge: d ? count(d.out, "out of stock") : undefined, bars: d ? [d.low, d.out] : undefined },
    { label: "Overdue tasks", value: d ? String(d.overdueTasks) : null, icon: AlertTriangle, color: "var(--destructive)", to: "/app/projects",
      badge: d ? (d.overdueTasks ? count(d.overdueTasks, "late") : { text: "All on time", tone: "good" }) : undefined },
  ];

  return (
    <AppShell title={org?.name ?? "Workspace"} breadcrumb="dashboard">
      <div className="space-y-6">
        <GettingStarted forceOpen={!!welcome} setup={d?.setup} ready={!!d} />
        <FirstSale setup={d?.setup} />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {kpis.filter((k) => moduleShown(k.to, org?.enabled_modules, membership?.role)).map((k) => <KpiCard key={k.label} {...k} />)}
        </div>

        <SponsorOffers />

        {roleCharts ? roleCharts.map((m) => <ModuleCharts key={m} module={m} />) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Panel title="Cash in and out" hint="Payments received and money spent, last 6 months" to="/app/reports/sales">
              {!d ? <ChartSkeleton /> : d.cash.every((c) => !c.in && !c.out) ? <ChartEmpty text="No payments or spending yet." to="/app/sales/payments" cta="Record a payment" /> : (
                <TrendArea data={d.cash} x="month" series={[{ key: "in", label: "Cash in", color: "var(--success)" }, { key: "out", label: "Spent", color: "var(--chart-1)", dashed: true }]} />
              )}
            </Panel>
          </div>

          <Panel title="Invoices by status" hint="Value of each status" to="/app/invoices">
            {!d ? <ChartSkeleton /> : !d.byStatus.length ? <ChartEmpty text="No invoices yet." to="/app/invoices" cta="Create an invoice" /> : (
              <Donut parts={d.byStatus.map((st) => ({ label: st.key, value: st.value }))} format={(n) => money(n, ccy)} totalLabel="invoiced" />
            )}
          </Panel>

          <div className="lg:col-span-2">
            <Panel title="Pipeline by stage" hint="Open deals: value and number in each stage" to="/app/crm/deals">
              {crm.isLoading ? <ChartSkeleton /> : !stages.length ? <ChartEmpty text="No open deals yet." to="/app/crm/deals" cta="Add a deal" /> : (
                <SegmentBar parts={stages} format={(n) => money(n, ccy)} unit={["deal", "deals"]} />
              )}
            </Panel>
          </div>

          <Panel title="Top customers" hint="Paid to you, all time" to="/app/customers">
            {!d ? <ChartSkeleton /> : !d.topCustomers.length ? <ChartEmpty text="No paid invoices yet." to="/app/invoices" cta="Go to invoices" /> : (
              <RankList data={d.topCustomers.map((c) => ({ label: c.name, value: c.value }))} format={(n) => money(n, ccy)} />
            )}
          </Panel>
        </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <RecentList title="Recent activity" to="/app/crm/activities" empty="No activity yet." loading={!d}
            rows={(d?.recentActs ?? []).map((a) => ({ id: a.id, title: a.title, sub: `${a.type} · ${new Date(a.created_at).toLocaleDateString()}`, right: a.completed ? "Done" : "Open" }))} />
          <RecentList title="Recent payments" to="/app/sales/payments" empty="No payments yet." loading={!d}
            rows={(d?.recentPayments ?? []).map((p) => {
              const inv = p.invoices as { id: string; number: string; companies: { name: string } | null } | null;
              return { id: p.id, title: `${inv?.number ?? "Payment"}${inv?.companies?.name ? ` · ${inv.companies.name}` : ""}`, sub: new Date(p.payment_date).toLocaleDateString(), right: money(Number(p.amount), p.currency), to: inv ? `/app/invoices/${inv.id}` : undefined };
            })} />
          <RecentList title="Recent purchase orders" to="/app/purchasing/orders" empty="No purchase orders yet." loading={!d}
            rows={(d?.recentPOs ?? []).map((p) => ({ id: p.id, title: `${p.po_number}${(p.suppliers as { name: string } | null)?.name ? ` · ${(p.suppliers as { name: string }).name}` : ""}`, sub: p.status.replace(/_/g, " "), right: money(Number(p.total), ccy), to: `/app/purchasing/orders/${p.id}` }))} />
        </div>
      </div>
    </AppShell>
  );
}

function RecentList({ title, to, rows, empty, loading }: {
  title: string; to: string; empty: string; loading: boolean;
  rows: Array<{ id: string; title: string; sub: string; right: string; to?: string }>;
}) {
  return (
    <section className="border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <SectionTitle>{title}</SectionTitle>
        <Link to={to} className="text-xs text-muted-foreground hover:text-foreground">See all →</Link>
      </div>
      {loading ? <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        : !rows.length ? <p className="p-6 text-center text-sm text-muted-foreground">{empty}</p>
        : (
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const body = (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{r.title}</div>
                    <div className="text-xs capitalize text-muted-foreground">{r.sub}</div>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums">{r.right}</span>
                </>
              );
              return (
                <li key={r.id}>
                  {r.to ? <Link to={r.to} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30">{body}</Link>
                    : <div className="flex items-center gap-3 px-4 py-2.5">{body}</div>}
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}

/** First steps for a new workspace. Ticks itself off from real data; hides when done or dismissed. */
function GettingStarted({ forceOpen, setup, ready }: { forceOpen: boolean; setup?: DashExtras["setup"]; ready: boolean }) {
  const orgId = useOrgId();
  const user = useCurrentUser();
  const { hidden, requested, hide } = useChecklist("getting-started", orgId);
  forceOpen = forceOpen || requested;
  // The counts come with the dashboard call (DB-26); these queries only run without it, and not once hidden.
  const old = useQuery({
    enabled: !!orgId && !!user?.id && ready && !setup && (forceOpen || !hidden),
    queryKey: ["getting-started", orgId],
    queryFn: async () => {
      const [org, members, companies, apps, keys] = await Promise.all([
        supabase.from("organizations").select("email, address, phone").eq("id", orgId!).maybeSingle(),
        supabase.from("memberships").select("id", { count: "exact", head: true }).eq("org_id", orgId!).in("status", ["active", "invited"]),
        supabase.from("companies").select("id", { count: "exact", head: true }).eq("org_id", orgId!),
        supabase.from("mcp_connections").select("id", { count: "exact", head: true }).eq("org_id", orgId!).is("revoked_at", null),
        supabase.from("personal_api_keys").select("id", { count: "exact", head: true }).eq("org_id", orgId!).is("revoked_at", null),
      ]);
      return {
        details: !!(org.data?.email || org.data?.address || org.data?.phone),
        members: members.count ?? 0, companies: companies.count ?? 0, apps: (apps.count ?? 0) + (keys.count ?? 0),
      };
    },
  });
  const c = setup ?? old.data;
  const list = c ? [
    { done: c.details, label: "Add your company details", hint: "They print on quotes and invoices.", to: "/app/settings/organization", icon: Building2 },
    { done: c.members > 1, label: "Invite a teammate", hint: "No plan charges per person.", to: "/app/settings/members", icon: UserPlus },
    { done: c.companies > 0, label: "Add your first customer", hint: "Or import them from a CSV.", to: "/app/crm/companies", icon: Handshake },
    { done: c.apps > 0, label: "Connect your AI app", hint: "Ask Claude or ChatGPT about your business.", to: "/app/settings/developer", icon: PlugZap },
  ] : [];
  const left = list.filter((s) => !s.done).length;
  if (!list.length || (!forceOpen && (hidden || left === 0))) return null;
  return (
    <section className="border border-border bg-card shadow-sm p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <SectionTitle>{left ? `Getting started: ${list.length - left} of ${list.length} done` : "You're all set up"}</SectionTitle>
          <p className="text-xs text-muted-foreground">A few steps that make the rest of Inuberry useful.{" "}
            <Button variant="link" onClick={startTour} className="h-auto p-0 text-xs">Take the tour</Button>
          </p>
        </div>
        <Button variant="bare" size="bare" aria-label="Hide getting started" onClick={() => { hide(); toast("Getting started is hidden", { description: "Bring it back any time from Help (the ? in the top bar)." }); }}
          className="p-1 text-muted-foreground hover:text-foreground"><X className="size-4" /></Button>
      </div>
      <ol className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {list.map((s) => (
          <li key={s.label}>
            <Link to={s.to} className="flex h-full items-start gap-3 bg-background p-3 hover:bg-muted/30">
              {s.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
              <span>
                <span className={`block text-sm font-medium ${s.done ? "text-muted-foreground line-through" : ""}`}>{s.label}</span>
                <span className="block text-xs text-muted-foreground">{s.hint}</span>
              </span>
              <s.icon className="ml-auto size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * "Your first sale", step by step inside the app: customer → quote → send → invoice → payment.
 * Ticks itself off from real counts (DB-27) and hides once done or dismissed.
 */
function FirstSale({ setup }: { setup?: DashExtras["setup"] }) {
  const orgId = useOrgId();
  const { hidden, requested, hide } = useChecklist("first-sale", orgId);
  if (!setup || setup.quotes === undefined || hidden) return null;
  const steps = [
    { done: setup.companies > 0, label: "Add a customer", hint: "The company you're selling to.", to: "/app/crm/companies", search: { new: 1 } },
    { done: (setup.quotes ?? 0) > 0, label: "Write a quote", hint: "Pick the customer, add lines, save.", to: "/app/sales/quotes", search: { new: 1 } },
    { done: (setup.sentQuotes ?? 0) > 0, label: "Send it", hint: "Email or PDF from the quote page.", to: "/app/sales/quotes" },
    { done: (setup.invoices ?? 0) > 0, label: "Turn it into an invoice", hint: "On the quote: To invoice.", to: "/app/invoices" },
    { done: (setup.payments ?? 0) > 0, label: "Record the payment", hint: "On the invoice: Record payment.", to: "/app/invoices" },
  ];
  const left = steps.filter((x) => !x.done).length;
  if (!left && !requested) return null;
  const next = steps.findIndex((x) => !x.done);
  return (
    <section aria-labelledby="first-sale" className="border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 id="first-sale" className="text-sm font-semibold">{left ? `Your first sale: ${steps.length - left} of ${steps.length} done` : "Your first sale: all done"}</h2>
          <p className="text-xs text-muted-foreground">From a customer to money in the bank. Each step opens the right page.</p>
        </div>
        <Button variant="bare" size="bare" aria-label="Hide your first sale" onClick={() => { hide(); toast("Your first sale is hidden", { description: "Bring it back any time from Help (the ? in the top bar)." }); }}
          className="p-1 text-muted-foreground hover:text-foreground"><X className="size-4" /></Button>
      </div>
      <ol className="grid gap-px border border-border bg-border sm:grid-cols-5">
        {steps.map((x, i) => (
          <li key={x.label}>
            <Link to={x.to} search={x.search as never} className={`flex h-full items-start gap-2 p-3 hover:bg-muted/30 ${i === next ? "bg-primary/5" : "bg-background"}`}>
              {x.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center font-mono text-xs text-muted-foreground">{i + 1}</span>}
              <span>
                <span className={`block text-sm font-medium ${x.done ? "text-muted-foreground line-through" : ""}`}>{x.label}</span>
                <span className="block text-xs text-muted-foreground">{x.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
