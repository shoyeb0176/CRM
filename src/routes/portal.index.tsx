import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PortalShell, StatTile, PortalCard, EmptyState } from "@/components/portal/portal-shell";
import { usePortalIdentity, fmtMoney, fmtDate } from "@/lib/portal/use-portal";

export const Route = createFileRoute("/portal/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Overview — Customer Portal" }] }),
  component: PortalHome,
});

function PortalHome() {
  const identity = usePortalIdentity();
  const id = identity.data;

  const dash = useQuery({
    enabled: !!id?.company_id,
    queryKey: ["portal-dash", id?.org_id, id?.company_id],
    queryFn: async () => {
      const orgId = id!.org_id;
      const companyId = id!.company_id!;
      const [invs, quotes, projects, tickets] = await Promise.all([
        supabase.from("invoices").select("id,number,status,total,balance_due,due_date,currency")
          .eq("org_id", orgId).eq("company_id", companyId).order("issue_date", { ascending: false }).limit(5),
        supabase.from("quotes").select("id,number,status,total,currency,created_at")
          .eq("org_id", orgId).eq("company_id", companyId).order("created_at", { ascending: false }).limit(5),
        supabase.from("projects").select("id,code,name,status,due_date")
          .eq("org_id", orgId).eq("customer_company_id", companyId).eq("archived", false)
          .order("created_at", { ascending: false }).limit(5),
        supabase.from("support_tickets").select("id,subject,status,priority,created_at")
          .eq("org_id", orgId).eq("company_id", companyId).order("created_at", { ascending: false }).limit(5),
      ]);
      const open = (invs.data ?? []).filter(i => Number(i.balance_due) > 0);
      const totalOpen = open.reduce((s, i) => s + Number(i.balance_due ?? 0), 0);
      return {
        invoices: invs.data ?? [],
        quotes: quotes.data ?? [],
        projects: projects.data ?? [],
        tickets: tickets.data ?? [],
        openCount: open.length,
        openTotal: totalOpen,
        activeProjects: (projects.data ?? []).filter(p => p.status === "active").length,
        openTickets: (tickets.data ?? []).filter(t => t.status !== "closed" && t.status !== "resolved").length,
      };
    },
  });

  if (identity.isLoading) {
    return <PortalShell title="Overview"><div className="text-sm text-muted-foreground">Loading…</div></PortalShell>;
  }
  if (!id) {
    return (
      <PortalShell title="Welcome">
        <div className="border border-border bg-card shadow-sm p-8 text-center">
          <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Account not yet linked</div>
          <h2 className="mt-2 font-display text-xl">Awaiting portal invitation</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Your account is created, but no organization has granted portal access yet.
            Please ask your contact to add your email to their customer portal.
          </p>
        </div>
      </PortalShell>
    );
  }

  const d = dash.data;
  return (
    <PortalShell title={`Welcome back${id.full_name ? `, ${id.full_name.split(" ")[0]}` : ""}`} breadcrumb="Portal / Overview">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatTile label="Open balance" value={fmtMoney(d?.openTotal ?? 0)} hint={`${d?.openCount ?? 0} invoices`} />
        <StatTile label="Quotes" value={d?.quotes.length ?? 0} hint="recent" />
        <StatTile label="Active projects" value={d?.activeProjects ?? 0} />
        <StatTile label="Open tickets" value={d?.openTickets ?? 0} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PortalCard title="Recent invoices" action={<Link to="/portal/invoices" className="text-xs text-muted-foreground hover:text-foreground">View all →</Link>}>
          {d?.invoices.length ? (
            <div className="divide-y divide-border">
              {d.invoices.map(i => (
                <div key={i.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <div className="font-medium">{i.number ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">Due {fmtDate(i.due_date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono">{fmtMoney(i.total, i.currency ?? "USD")}</div>
                    <div className="text-xs uppercase text-muted-foreground">{i.status}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState compact title="No invoices yet" />}
        </PortalCard>

        <PortalCard title="Recent quotes" action={<Link to="/portal/quotes" className="text-xs text-muted-foreground hover:text-foreground">View all →</Link>}>
          {d?.quotes.length ? (
            <div className="divide-y divide-border">
              {d.quotes.map(q => (
                <div key={q.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <div className="font-medium">{q.number ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(q.created_at)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono">{fmtMoney(q.total, q.currency ?? "USD")}</div>
                    <div className="text-xs uppercase text-muted-foreground">{q.status}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState compact title="No quotes yet" />}
        </PortalCard>

        <PortalCard title="Active projects" action={<Link to="/portal/projects" className="text-xs text-muted-foreground hover:text-foreground">View all →</Link>}>
          {d?.projects.length ? (
            <div className="divide-y divide-border">
              {d.projects.map(p => (
                <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.code ?? "—"}</div>
                  </div>
                  <div className="text-right text-xs uppercase text-muted-foreground">{p.status}</div>
                </div>
              ))}
            </div>
          ) : <EmptyState compact title="No projects yet" />}
        </PortalCard>

        <PortalCard title="Support tickets" action={<Link to="/portal/support" className="text-xs text-muted-foreground hover:text-foreground">View all →</Link>}>
          {d?.tickets.length ? (
            <div className="divide-y divide-border">
              {d.tickets.map(t => (
                <div key={t.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <div className="font-medium">{t.subject}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(t.created_at)}</div>
                  </div>
                  <div className="text-right text-xs uppercase text-muted-foreground">{t.status}</div>
                </div>
              ))}
            </div>
          ) : <EmptyState compact title="No tickets" description="Open one from the Support tab." />}
        </PortalCard>
      </div>
    </PortalShell>
  );
}
