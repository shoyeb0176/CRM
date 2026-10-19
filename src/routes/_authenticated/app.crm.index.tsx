import { KpiCard } from "@/components/charts/kpi-card";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ModuleCharts, useOverviewKpis } from "@/components/charts/module-charts";
import { supabase } from "@/integrations/supabase/client";
import { CrmShell } from "@/components/crm/crm-shell";
import { useOrgId } from "@/lib/crm/use-org";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/crm/status-badge";
import { ArrowRight, Calendar, CheckCircle2, Users, Building2, Sparkles, Briefcase } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/crm/")({
  head: () => ({ meta: [{ title: "CRM — Inuberry" }] }),
  component: CrmOverview,
});

function fmtMoney(n: number, ccy = "USD") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(n);
}

function CrmOverview() {
  const orgId = useOrgId();

  // One overview call for the whole page (DB-26); these separate queries only run without it.
  const kpis = useOverviewKpis("crm", "crm-overview", async () => {
    const [contacts, companies, leads, openDeals, activities] = await Promise.all([
      supabase.from("contacts").select("id", { count: "exact", head: true }).eq("org_id", orgId!).eq("archived", false),
      supabase.from("companies").select("id", { count: "exact", head: true }).eq("org_id", orgId!).eq("archived", false),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId!).neq("status", "converted"),
      supabase.from("deals").select("amount").eq("org_id", orgId!).eq("status", "open"),
      supabase.from("activities").select("id", { count: "exact", head: true }).eq("org_id", orgId!).eq("completed", false),
    ]);
    const pipeline = (openDeals.data ?? []).reduce((s, d) => s + Number(d.amount ?? 0), 0);
    return {
      contacts: contacts.count ?? 0,
      companies: companies.count ?? 0,
      leads: leads.count ?? 0,
      openDealsCount: openDeals.data?.length ?? 0,
      pipeline,
      openActivities: activities.count ?? 0,
    };
  });

  // One overview call for the whole page (DB-26); these separate queries only run without it.
  const recent = useOverviewKpis("crm", "crm-recent-activities", async () => {
    const { data, error } = await supabase
      .from("activities")
      .select("id, type, title, due_at, completed, entity_type, entity_id, created_at")
      .eq("org_id", orgId!)
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) throw error;
    return data ?? [];
  }, (s) => s.recent);

  const tiles = [
    { label: "Pipeline value",     value: kpis.data ? fmtMoney(kpis.data.pipeline) : "—", icon: Sparkles,    href: "/app/crm/deals" },
    { label: "Open deals",         value: kpis.data?.openDealsCount ?? "—",               icon: Briefcase,    href: "/app/crm/deals" },
    { label: "Contacts",           value: kpis.data?.contacts ?? "—",                     icon: Users,        href: "/app/crm/contacts" },
    { label: "Companies",          value: kpis.data?.companies ?? "—",                    icon: Building2,    href: "/app/crm/companies" },
    { label: "Active leads",       value: kpis.data?.leads ?? "—",                        icon: ArrowRight,   href: "/app/crm/leads" },
    { label: "Open activities",    value: kpis.data?.openActivities ?? "—",               icon: Calendar,     href: "/app/crm/activities" },
  ];

  return (
    <CrmShell title="CRM" breadcrumb="crm">
      <div className="mb-6"><ModuleCharts module="crm" /></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((t) => (
          <KpiCard key={t.label} label={t.label} icon={t.icon} to={t.href} value={kpis.isLoading ? null : String(t.value)} />
        ))}
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between border-b border-border pb-2">
          <h2 className="font-heading text-lg uppercase">Recent activity</h2>
          <Link to="/app/crm/activities" className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
            View all →
          </Link>
        </div>
        {recent.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : !recent.data || recent.data.length === 0 ? (
          <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No activity yet. Log calls, emails, meetings and tasks from any contact or deal.
          </div>
        ) : (
          <ul className="divide-y divide-border border border-border bg-card">
            {recent.data.map((a) => (
              <li key={a.id} className="flex items-center gap-4 px-4 py-3">
                <CheckCircle2 className={`size-4 ${a.completed ? "text-success" : "text-muted-foreground/40"}`} />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm">{a.title}</div>
                  <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    {a.type} · {a.due_at ? new Date(a.due_at).toLocaleString() : "no due date"}
                  </div>
                </div>
                <StatusBadge tone={a.completed ? "success" : "info"}>{a.completed ? "Done" : "Open"}</StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </CrmShell>
  );
}
