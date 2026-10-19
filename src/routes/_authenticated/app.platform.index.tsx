import { KpiTile } from "@/components/ui/kpi-tile";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PLATFORM_GROUPS, PLATFORM_SECTIONS, PlatformShell } from "@/components/platform/platform-shell";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { checkForUpdate, getPlatformOverview } from "@/lib/platform/platform.functions";
import { fmtMoney } from "@/lib/billing/use-subscription";
import { Building2, CreditCard, Users, TrendingUp, AlertTriangle, Clock, PauseOctagon, Beaker } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/platform/")({
  head: () => ({ meta: [{ title: "Platform — Inuberry" }] }),
  component: PlatformOverview,
});

function PlatformOverview() {
  const overviewFn = useServerFn(getPlatformOverview);
  const overview = useQuery({ queryKey: ["platform-overview"], queryFn: () => overviewFn() });
  const updateFn = useServerFn(checkForUpdate);
  const update = useQuery({ queryKey: ["platform-update-check"], queryFn: () => updateFn(), staleTime: 60 * 60 * 1000 });

  const mrrQ = useQuery({
    queryKey: ["platform-mrr"],
    queryFn: async () => {
      const [subs, plans] = await Promise.all([
        supabase.from("organization_subscriptions").select("plan_id, billing_cycle, status, custom_offering_id"),
        supabase.from("subscription_plans").select("id, price_monthly, price_yearly"),
      ]);
      const planMap = new Map((plans.data ?? []).map((p) => [p.id, p]));
      let mrr = 0;
      for (const s of subs.data ?? []) {
        if (s.status !== "active" && s.status !== "trialing") continue;
        const p = planMap.get(s.plan_id);
        if (!p) continue;
        mrr += s.billing_cycle === "yearly" ? Number(p.price_yearly) / 12 : Number(p.price_monthly);
      }
      return Math.round(mrr);
    },
  });

  // Small live counts on the tiles below: what needs a look today.
  const todo = useQuery({
    queryKey: ["platform-todo"],
    queryFn: async () => {
      const [reports, sponsors] = await Promise.all([
        supabase.from("platform_tickets").select("id", { count: "exact", head: true }).in("status", ["new", "in_review", "in_progress"]),
        supabase.from("sponsor_offers").select("id", { count: "exact", head: true }).eq("is_active", true),
      ]);
      return { reports: reports.count ?? 0, sponsors: sponsors.count ?? 0 };
    },
  });

  const s = overview.data as any;
  const badge: Record<string, string | null> = {
    "/app/platform/feedback": todo.data ? `${todo.data.reports} open` : null,
    "/app/platform/subscriptions": s ? `${s.trials_expiring_7d ?? 0} trials ending this week` : null,
    "/app/platform/organizations": s ? `${s.total_orgs ?? 0} workspaces${s.suspended_orgs ? `, ${s.suspended_orgs} suspended` : ""}` : null,
    "/app/platform/sponsors": todo.data ? `${todo.data.sponsors} live` : null,
    "/app/platform/demo": s ? `${s.demo_orgs ?? 0} running` : null,
  };

  return (
    <PlatformShell title="Platform" breadcrumb="platform">
      {update.data?.updateAvailable && (
        <div role="status" className="mb-4 border border-primary/40 bg-primary/5 p-4 text-sm">
          <strong>Update available:</strong> {update.data.latest} (you run v{update.data.current}).{" "}
          {update.data.url && <a href={update.data.url} target="_blank" rel="noreferrer" className="underline">Release notes</a>}
          {" "}See docs/self-hosting.md → Upgrading.
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={<Building2 />} label="Workspaces" value={s?.total_orgs ?? "—"} />
        <KpiTile icon={<Users />} label="Active members" value={s?.total_active_users ?? "—"} />
        <KpiTile icon={<CreditCard />} label="Active plans" value={s?.active_orgs ?? "—"} />
        <KpiTile icon={<TrendingUp />} label="Monthly revenue (MRR)" value={mrrQ.data != null ? fmtMoney(mrrQ.data) : "—"} />
        <KpiTile icon={<Clock />} label="Trialing" value={s?.trialing_orgs ?? "—"} />
        <KpiTile icon={<AlertTriangle />} label="Trials ending in 7 days" value={s?.trials_expiring_7d ?? "—"} />
        <KpiTile icon={<PauseOctagon />} label="Suspended" value={s?.suspended_orgs ?? "—"} />
        <KpiTile icon={<Beaker />} label="Demo workspaces" value={s?.demo_orgs ?? "—"} />
      </div>

      <div className="mt-8 space-y-8">
        {PLATFORM_GROUPS.map((g) => (
          <section key={g}>
            <h2 className="mb-3 font-heading text-sm">{g}</h2>
            <div className="grid grid-cols-1 gap-px border border-border bg-border md:grid-cols-2 xl:grid-cols-3">
              {PLATFORM_SECTIONS.filter((x) => x.group === g).map(({ to, label, desc, icon: Icon }) => (
                <Link key={to} to={to} className="group flex gap-3 bg-background p-5 transition-colors hover:bg-foreground/5">
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                  <div>
                    <div className="font-semibold">{label}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{desc}</div>
                    {badge[to] && <div className="mt-2 font-mono text-xs uppercase tracking-widest text-primary">{badge[to]}</div>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
        <p className="max-w-2xl text-sm text-muted-foreground">
          Everything done here is written to the Audit log, and anything done inside a workspace (support access)
          is also visible to that workspace's admins.
        </p>
      </div>
    </PlatformShell>
  );
}
