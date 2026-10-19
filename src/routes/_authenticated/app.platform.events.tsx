import { createFileRoute } from "@tanstack/react-router";
import { PlatformShell } from "@/components/platform/platform-shell";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageToolbar } from "@/components/crm/page-toolbar";
import { TablePager } from "@/components/ui/table-pager";
import { ilikeAny, usePaged } from "@/lib/use-paged";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney } from "@/lib/billing/use-subscription";

export const Route = createFileRoute("/_authenticated/app/platform/events")({
  head: () => ({ meta: [{ title: "Billing events — Platform" }] }),
  component: PlatformEvents,
});

function PlatformEvents() {
  const p = usePaged();
  const [kind, setKind] = useState("all");
  const data = useQuery({
    queryKey: ["platform-events", p.q, kind, p.page, p.size],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase
        .from("billing_events")
        .select("id, created_at, description, event_type, amount, currency, stripe_event_id, organization:org_id(name, slug)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(p.from, p.to);
      const or = ilikeAny(["event_type", "description", "stripe_event_id"], p.q);
      if (or) query = query.or(or);
      // Stripe event names vary, so the filter matches a family: checkout.*, invoice.*, package.* …
      if (kind !== "all") query = query.ilike("event_type", `%${kind}%`);
      const { data, count, error } = await query;
      if (error) throw error;
      return { rows: data ?? [], count };
    },
  });

  return (
    <PlatformShell title="Billing events" breadcrumb="platform · events">
      <PageToolbar
        search={p.search}
        onSearchChange={p.setSearch}
        placeholder="Search event, description or Stripe id…"
        filters={
          <select aria-label="Event type" value={kind} onChange={(e) => { setKind(e.target.value); p.reset(); }} className="h-9 border border-input bg-card shadow-xs px-2 font-mono text-xs uppercase">
            {["all", "checkout", "subscription", "invoice", "payment", "package", "storage"].map((v) => <option key={v} value={v}>{v === "all" ? "All events" : v}</option>)}
          </select>
        }
      />
      <div className="border border-border">
        {/* Rows scroll sideways on small screens; the pager below stays put. */}
        <div className="overflow-x-auto [&>*]:min-w-[856px]">
        <div className="grid grid-cols-[160px_minmax(10rem,1fr)_180px_120px_140px] gap-4 border-b border-border bg-muted px-4 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <div>When</div><div>Organization</div><div>Event</div><div>Amount</div><div>Stripe id</div>
        </div>
        {data.isLoading && <div className="p-6 font-mono text-xs text-muted-foreground">Loading…</div>}
        {data.data?.rows.length === 0 && <div className="p-6 font-mono text-xs text-muted-foreground">No events match.</div>}
        {data.isError && <div className="p-6 font-mono text-xs text-destructive">{(data.error as Error).message}</div>}
        {data.data?.rows.map((e) => {
          const org = (e as unknown as { organization: { name: string; slug: string } | null }).organization;
          return (
            <div key={e.id} className="grid grid-cols-[160px_minmax(10rem,1fr)_180px_120px_140px] items-start gap-4 border-b border-border px-4 py-3 last:border-b-0">
              <div className="font-mono text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</div>
              <div>
                <div className="text-sm font-semibold">{org?.name ?? "—"}</div>
                {e.description && <div className="text-xs text-muted-foreground">{e.description}</div>}
              </div>
              <div className="font-mono text-xs uppercase tracking-wider">{e.event_type}</div>
              <div className="font-mono text-sm tabular-nums">{e.amount != null ? fmtMoney(Number(e.amount), e.currency ?? "USD") : "—"}</div>
              <div className="truncate font-mono text-xs text-muted-foreground">{e.stripe_event_id ?? "—"}</div>
            </div>
          );
        })}
        </div>
        <TablePager page={p.page} size={p.size} total={data.data?.count} onPage={p.setPage} onSize={p.setSize} />
      </div>
    </PlatformShell>
  );
}
