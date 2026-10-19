import { createFileRoute, Link } from "@tanstack/react-router";
import { PlatformShell } from "@/components/platform/platform-shell";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageToolbar } from "@/components/crm/page-toolbar";
import { TablePager } from "@/components/ui/table-pager";
import { ilikeAny, usePaged } from "@/lib/use-paged";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/platform/organizations/")({
  head: () => ({ meta: [{ title: "Organizations — Platform" }] }),
  component: PlatformOrgs,
});

function PlatformOrgs() {
  const p = usePaged();
  const [status, setStatus] = useState("all");
  const data = useQuery({
    queryKey: ["platform-orgs", p.q, status, p.page, p.size],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      // Only this page's orgs, with their active member count and subscription.
      const sub = status === "all" ? "organization_subscriptions(status, plan:plan_id(name))" : "organization_subscriptions!inner(status, plan:plan_id(name))";
      let query = supabase
        .from("organizations")
        .select(`id, name, slug, default_currency, created_at, memberships(count), ${sub}`, { count: "exact" })
        .eq("memberships.status", "active")
        .order("created_at", { ascending: false })
        .range(p.from, p.to);
      const or = ilikeAny(["name", "slug"], p.q);
      if (or) query = query.or(or);
      if (status !== "all") query = query.eq("organization_subscriptions.status", status as never);
      const { data: rows, count, error } = await query;
      if (error) throw error;
      return {
        count,
        rows: (rows ?? []).map((o) => {
          const s = (o as { organization_subscriptions: unknown }).organization_subscriptions;
          const m = (o as { memberships: { count: number }[] }).memberships;
          return { ...o, member_count: m?.[0]?.count ?? 0, subscription: (Array.isArray(s) ? s[0] : s) ?? null };
        }),
      };
    },
  });

  return (
    <PlatformShell title="Organizations" breadcrumb="platform · organizations">
      <PageToolbar
        search={p.search}
        onSearchChange={p.setSearch}
        placeholder="Search name or slug…"
        filters={
          <select aria-label="Plan status" value={status} onChange={(e) => { setStatus(e.target.value); p.reset(); }} className="h-9 border border-input bg-card shadow-xs px-2 font-mono text-xs uppercase">
            {["all", "active", "trialing", "past_due", "canceled", "expired"].map((v) => <option key={v} value={v}>{v === "all" ? "All statuses" : v.replace("_", " ")}</option>)}
          </select>
        }
      />
      <div className="border border-border">
        {/* Rows scroll sideways on small screens; the pager below stays put. */}
        <div className="overflow-x-auto [&>*]:min-w-[836px]">
        <div className="grid grid-cols-[minmax(10rem,1fr)_140px_140px_140px_160px] gap-4 border-b border-border bg-muted px-4 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <div>Organization</div><div>Plan</div><div>Status</div><div>Users</div><div>Created</div>
        </div>
        {data.isLoading && <div className="p-6 font-mono text-xs text-muted-foreground">Loading…</div>}
        {data.data?.rows.length === 0 && <div className="p-6 font-mono text-xs text-muted-foreground">No organizations match.</div>}
        {data.isError && <div className="p-6 font-mono text-xs text-destructive">{(data.error as Error).message}</div>}
        {data.data?.rows.map((o) => {
          const sub = o.subscription as { status: string; plan: { name: string } | null } | null;
          return (
            <Link
              key={o.id}
              to="/app/platform/organizations/$orgId"
              params={{ orgId: o.id }}
              className="grid grid-cols-[minmax(10rem,1fr)_140px_140px_140px_160px] items-center gap-4 border-b border-border px-4 py-3 last:border-b-0 hover:bg-muted/40"
            >
              <div>
                <div className="text-sm font-semibold">{o.name}</div>
                <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{o.slug} · {o.default_currency}</div>
              </div>
              <div className="font-mono text-xs uppercase tracking-wider">{sub?.plan?.name ?? "—"}</div>
              <div>
                <span className={`px-2 py-0.5 font-mono text-xs uppercase tracking-wider ${
                  sub?.status === "active" ? "bg-primary text-primary-foreground" :
                  sub?.status === "trialing" ? "bg-foreground/80 text-background" :
                  "border border-border bg-background text-muted-foreground"
                }`}>{sub?.status ?? "no sub"}</span>
              </div>
              <div className="font-mono text-sm tabular-nums">{o.member_count}</div>
              <div className="font-mono text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</div>
            </Link>
          );
        })}
        </div>
        <TablePager page={p.page} size={p.size} total={data.data?.count} onPage={p.setPage} onSize={p.setSize} />
      </div>
    </PlatformShell>
  );
}
