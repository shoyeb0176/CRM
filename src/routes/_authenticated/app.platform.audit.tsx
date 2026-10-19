import { createFileRoute } from "@tanstack/react-router";
import { PlatformShell } from "@/components/platform/platform-shell";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { PageToolbar } from "@/components/crm/page-toolbar";
import { TablePager } from "@/components/ui/table-pager";
import { ilikeAny, usePaged } from "@/lib/use-paged";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/app/platform/audit")({
  head: () => ({ meta: [{ title: "Audit — Platform" }] }),
  component: AuditPage,
});

function AuditPage() {
  const p = usePaged();
  const [days, setDays] = useState("all");
  const list = useQuery({
    queryKey: ["platform-audit", p.q, days, p.page, p.size],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from("platform_audit_logs")
        .select("*, org:target_org(name, slug)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(p.from, p.to);
      const or = ilikeAny(["action"], p.q);
      if (or) q = q.or(or);
      if (days !== "all") {
        const since = new Date();
        if (days === "0") since.setHours(0, 0, 0, 0); else since.setDate(since.getDate() - Number(days));
        q = q.gte("created_at", since.toISOString());
      }
      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: data ?? [], count };
    },
  });

  return (
    <PlatformShell title="Audit log" breadcrumb="platform · audit">
      <PageToolbar
        search={p.search}
        onSearchChange={p.setSearch}
        placeholder="Search action (e.g. suspend, impersonation)…"
        filters={
          <select aria-label="Period" value={days} onChange={(e) => { setDays(e.target.value); p.reset(); }} className="h-9 border border-input bg-card shadow-xs px-2 font-mono text-xs uppercase">
            <option value="all">All time</option><option value="0">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option>
          </select>
        }
      />
      <div className="border border-border">
        {/* Rows scroll sideways on small screens; the pager below stays put. */}
        <div className="overflow-x-auto [&>*]:min-w-[700px]">
        <div className="grid grid-cols-[140px_minmax(10rem,1fr)_180px_140px] gap-4 border-b border-border bg-muted px-4 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <div>When</div><div>Action / target</div><div>Actor</div><div>IP</div>
        </div>
        {list.data?.rows.length === 0 && <div className="p-6 font-mono text-xs text-muted-foreground">No entries match.</div>}
        {list.isError && <div className="p-6 font-mono text-xs text-destructive">{(list.error as Error).message}</div>}
        {(list.data?.rows ?? []).map((r) => (
          <div key={r.id} className="grid grid-cols-[140px_minmax(10rem,1fr)_180px_140px] items-start gap-4 border-b border-border px-4 py-3 last:border-b-0">
            <div className="font-mono text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
            <div>
              <div className="font-mono text-xs">{r.action}</div>
              <div className="font-mono text-xs text-muted-foreground">
                {r.org?.name ? `${r.org.name}` : ""}
                {r.details && Object.keys(r.details).length > 0 && (
                  <span> · {JSON.stringify(r.details).slice(0, 200)}</span>
                )}
              </div>
            </div>
            <div className="font-mono text-xs text-muted-foreground truncate">{r.actor_id ?? "system"}</div>
            <div className="font-mono text-xs text-muted-foreground">{r.ip_address ?? "—"}</div>
          </div>
        ))}
        </div>
        <TablePager page={p.page} size={p.size} total={list.data?.count} onPage={p.setPage} onSize={p.setSize} />
      </div>
    </PlatformShell>
  );
}
