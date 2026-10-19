import { createFileRoute } from "@tanstack/react-router";
import { PlatformShell } from "@/components/platform/platform-shell";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageToolbar } from "@/components/crm/page-toolbar";
import { TablePager } from "@/components/ui/table-pager";
import { ilikeAny, usePaged } from "@/lib/use-paged";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { endImpersonation } from "@/lib/platform/platform.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/platform/impersonation")({
  head: () => ({ meta: [{ title: "Impersonation — Platform" }] }),
  component: ImpersonationPage,
});

function ImpersonationPage() {
  const qc = useQueryClient();
  const p = usePaged();
  const [status, setStatus] = useState("all");
  const list = useQuery({
    queryKey: ["impersonation-requests", p.q, status, p.page, p.size],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from("impersonation_requests")
        .select("*, org:org_id(name, slug)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(p.from, p.to);
      const or = ilikeAny(["reason"], p.q);
      if (or) q = q.or(or);
      if (status !== "all") q = q.eq("status", status);
      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: data ?? [], count };
    },
  });

  const endM = useMutation({
    mutationFn: useServerFn(endImpersonation),
    onSuccess: () => { toast.success("Session ended"); qc.invalidateQueries({ queryKey: ["impersonation-requests"] }); },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <PlatformShell title="Impersonation" breadcrumb="platform · impersonation">
      <p className="mb-4 max-w-2xl font-mono text-xs uppercase tracking-widest text-muted-foreground">
        Every session requires org-admin approval. All actions taken during a session are logged and visible to that org's admins.
      </p>
      <PageToolbar
        search={p.search}
        onSearchChange={p.setSearch}
        placeholder="Search reason…"
        filters={
          <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); p.reset(); }} className="h-9 border border-input bg-card shadow-xs px-2 font-mono text-xs uppercase">
            {["all", "pending", "approved", "denied", "ended"].map((v) => <option key={v} value={v}>{v === "all" ? "All statuses" : v}</option>)}
          </select>
        }
      />
      <div className="border border-border">
        {/* Rows scroll sideways on small screens; the pager below stays put. */}
        <div className="overflow-x-auto [&>*]:min-w-[796px]">
        <div className="grid grid-cols-[minmax(10rem,1fr)_120px_140px_180px_100px] gap-4 border-b border-border bg-muted px-4 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <div>Reason / org</div><div>Status</div><div>Requested</div><div>Expires</div><div></div>
        </div>
        {list.data?.rows.length === 0 && <div className="p-6 font-mono text-xs text-muted-foreground">No requests match. To ask for support access, open Organizations, pick the company and use Request support access; an admin there approves it in Settings › Support access.</div>}
        {(list.data?.rows ?? []).map((r) => {
          const expired = !!r.expires_at && new Date(r.expires_at) <= new Date() && (r.status === "pending" || r.status === "approved");
          const active = r.status === "approved" && !expired;
          const status = expired ? "expired" : r.status;
          return (
            <div key={r.id} className="grid grid-cols-[minmax(10rem,1fr)_120px_140px_180px_100px] items-center gap-4 border-b border-border px-4 py-3 last:border-b-0">
              <div>
                <div className="text-sm">{r.reason}</div>
                <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{r.org?.name}</div>
              </div>
              <div>
                <span className={`px-2 py-0.5 font-mono text-xs uppercase tracking-wider ${
                  status === "approved" ? "bg-primary text-primary-foreground" :
                  status === "denied" || status === "ended" || status === "expired" ? "border border-destructive text-destructive" :
                  "border border-border text-muted-foreground"
                }`}>{status}</span>
              </div>
              <div className="font-mono text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
              <div className="font-mono text-xs text-muted-foreground">
                {r.expires_at ? new Date(r.expires_at).toLocaleString() : "—"}
              </div>
              <div>
                {active && (
                  <Button size="sm" variant="outline" onClick={() => endM.mutate({ data: { requestId: r.id } })}>End</Button>
                )}
              </div>
            </div>
          );
        })}
        </div>
        <TablePager page={p.page} size={p.size} total={list.data?.count} onPage={p.setPage} onSize={p.setSize} />
      </div>
    </PlatformShell>
  );
}
