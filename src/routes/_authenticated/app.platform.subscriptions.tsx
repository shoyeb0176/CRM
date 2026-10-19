import { createFileRoute } from "@tanstack/react-router";
import { PlatformShell } from "@/components/platform/platform-shell";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageToolbar } from "@/components/crm/page-toolbar";
import { TablePager } from "@/components/ui/table-pager";
import { ilikeAny, usePaged } from "@/lib/use-paged";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney } from "@/lib/billing/use-subscription";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/platform/subscriptions")({
  head: () => ({ meta: [{ title: "Subscriptions — Platform" }] }),
  component: PlatformSubs,
});

const STATUSES = ["trialing","active","past_due","canceled","expired","incomplete"] as const;

function PlatformSubs() {
  const qc = useQueryClient();
  const p = usePaged();
  const [status, setStatus] = useState("all");
  const [planId, setPlanId] = useState("all");
  const plans = useQuery({
    queryKey: ["platform-plan-names"],
    queryFn: async () => (await supabase.from("subscription_plans").select("id, name").order("sort_order")).data ?? [],
  });
  const data = useQuery({
    queryKey: ["platform-subs", p.q, status, planId, p.page, p.size],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const or = ilikeAny(["name", "slug"], p.q);
      let query = supabase
        .from("organization_subscriptions")
        .select(`*, organization:org_id${or ? "!inner" : ""}(name, slug), plan:plan_id(name, code, price_monthly, currency)`, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(p.from, p.to);
      if (or) query = query.or(or, { referencedTable: "organization" });
      if (status !== "all") query = query.eq("status", status as typeof STATUSES[number]);
      if (planId !== "all") query = query.eq("plan_id", planId);
      const { data, count, error } = await query;
      if (error) throw error;
      return { rows: data ?? [], count };
    },
  });
  const sel = "h-9 border border-input bg-card px-2 font-mono text-xs uppercase shadow-xs";

  async function changeStatus(id: string, status: typeof STATUSES[number]) {
    const { error } = await supabase.from("organization_subscriptions").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Status updated");
    qc.invalidateQueries({ queryKey: ["platform-subs"] });
  }

  return (
    <PlatformShell title="Subscriptions" breadcrumb="platform · subscriptions">
      <PageToolbar
        search={p.search}
        onSearchChange={p.setSearch}
        placeholder="Search organization…"
        filters={<>
          <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); p.reset(); }} className={sel}>
            <option value="all">All statuses</option>
            {STATUSES.map((st) => <option key={st} value={st}>{st.replace("_", " ")}</option>)}
          </select>
          <select aria-label="Plan" value={planId} onChange={(e) => { setPlanId(e.target.value); p.reset(); }} className={sel}>
            <option value="all">All plans</option>
            {(plans.data ?? []).map((pl) => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
          </select>
        </>}
      />
      <div className="border border-border">
        {/* Rows scroll sideways on small screens; the pager below stays put. */}
        <div className="overflow-x-auto [&>*]:min-w-[1012px]">
        <div className="grid grid-cols-[minmax(10rem,1fr)_140px_140px_140px_140px_180px] gap-4 border-b border-border bg-muted px-4 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <div>Organization</div><div>Plan</div><div>MRR</div><div>Cycle</div><div>Status</div><div>Stripe IDs</div>
        </div>
        {data.isLoading && <div className="p-6 font-mono text-xs text-muted-foreground">Loading…</div>}
        {data.data?.rows.length === 0 && <div className="p-6 font-mono text-xs text-muted-foreground">No subscriptions match.</div>}
        {data.isError && <div className="p-6 font-mono text-xs text-destructive">{(data.error as Error).message}</div>}
        {data.data?.rows.map((s) => {
          const org = (s as unknown as { organization: { name: string; slug: string } | null }).organization;
          const plan = (s as unknown as { plan: { name: string; price_monthly: number; currency: string } | null }).plan;
          const mrr = plan ? (s.billing_cycle === "yearly" ? Number(plan.price_monthly) : Number(plan.price_monthly)) : 0;
          return (
            <div key={s.id} className="grid grid-cols-[minmax(10rem,1fr)_140px_140px_140px_140px_180px] items-center gap-4 border-b border-border px-4 py-3 last:border-b-0">
              <div>
                <div className="text-sm font-semibold">{org?.name ?? "—"}</div>
                <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{org?.slug}</div>
              </div>
              <div className="font-mono text-xs uppercase tracking-wider">{plan?.name ?? "—"}</div>
              <div className="font-mono text-sm tabular-nums">{plan ? fmtMoney(mrr, plan.currency) : "—"}</div>
              <div className="font-mono text-xs uppercase tracking-wider">{s.billing_cycle}</div>
              <div>
                <select
                  value={s.status}
                  onChange={(e) => changeStatus(s.id, e.target.value as typeof STATUSES[number])}
                  className="border border-input bg-card shadow-xs px-2 py-1 font-mono text-xs uppercase tracking-wider focus:border-foreground focus:outline-none"
                >
                  {STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                </select>
              </div>
              <div className="min-w-0 break-all font-mono text-xs text-muted-foreground">
                <div>cust: {s.stripe_customer_id ?? "—"}</div>
                <div>sub: {s.stripe_subscription_id ?? "—"}</div>
              </div>
            </div>
          );
        })}
        </div>
        <TablePager page={p.page} size={p.size} total={data.data?.count} onPage={p.setPage} onSize={p.setSize} />
      </div>
    </PlatformShell>
  );
}
