import { createFileRoute } from "@tanstack/react-router";
import { SettingsShell } from "@/components/settings/settings-shell";
import { useAdminContext } from "@/lib/settings/use-admin";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { ChevronDown, ChevronRight, ShieldAlert } from "lucide-react";
import { JsonBlock } from "@/components/ui/code-block";

import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/_authenticated/app/settings/audit")({
  head: () => ({ meta: [{ title: "Audit log — Settings" }] }),
  component: AuditPage,
});

type LogRow = {
  id: string; created_at: string; user_id: string | null;
  action: string; entity_type: string | null; entity_id: string | null;
  old_values: unknown; new_values: unknown;
};

function AuditPage() {
  const { orgId, isAdmin } = useAdminContext();
  const [filter, setFilter] = useState("");

  const logs = useQuery({
    queryKey: ["audit", orgId, filter],
    enabled: !!orgId && isAdmin,
    queryFn: async () => {
      let q = supabase.from("audit_logs").select("*").eq("org_id", orgId!).order("created_at", { ascending: false }).limit(200);
      if (filter) q = q.ilike("action", `%${filter}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  const userIds = Array.from(new Set((logs.data ?? []).map((l) => l.user_id).filter(Boolean) as string[]));
  const profiles = useQuery({
    queryKey: ["audit-profiles", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
      const map = new Map<string, string>();
      (data ?? []).forEach((p) => map.set(p.id, p.full_name ?? "Unnamed"));
      return map;
    },
  });

  if (!isAdmin) {
    return (
      <SettingsShell title="Audit log" breadcrumb="settings · audit">
        <div className="flex items-center gap-3 border border-border bg-card shadow-sm p-6 text-sm text-muted-foreground">
          <ShieldAlert className="size-5" /> Only org owners and admins can view the audit log.
        </div>
      </SettingsShell>
    );
  }

  return (
    <SettingsShell title="Audit log" breadcrumb="settings · audit">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">History</div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Most recent 200 admin and data events for this workspace.
          </p>
        </div>
        <input
          value={filter} onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by action…"
          className="w-64 border border-input bg-card shadow-xs px-3 py-2 text-sm focus:border-foreground focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto border border-border bg-card shadow-sm [&>*]:min-w-[856px]">
        <div className="grid grid-cols-[180px_200px_1fr_180px_40px] gap-4 border-b border-border bg-muted px-4 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <div>When</div><div>User</div><div>Action</div><div>Entity</div><div></div>
        </div>
        {logs.isLoading && <div className="p-6 font-mono text-xs text-muted-foreground">Loading…</div>}
        {logs.data?.length === 0 && <div className="p-6 font-mono text-xs text-muted-foreground">No events yet.</div>}
        {logs.data?.map((l) => <LogItem key={l.id} log={l} userName={l.user_id ? profiles.data?.get(l.user_id) ?? "—" : "system"} />)}
      </div>
    </SettingsShell>
  );
}

function LogItem({ log, userName }: { log: LogRow; userName: string }) {
  const [open, setOpen] = useState(false);
  const hasDetail = !!log.old_values || !!log.new_values;
  return (
    <div className="border-b border-border last:border-b-0">
      <Button variant="bare" size="bare"
        onClick={() => hasDetail && setOpen(!open)}
        className={`grid w-full grid-cols-[180px_200px_1fr_180px_40px] items-center gap-4 px-4 py-3 text-left ${hasDetail ? "hover:bg-muted/50" : ""}`}
      >
        <div className="font-mono text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</div>
        <div className="text-sm">{userName}</div>
        <div className="font-mono text-xs uppercase tracking-wider">{log.action}</div>
        <div className="font-mono text-xs text-muted-foreground">{log.entity_type ?? "—"}</div>
        <div>{hasDetail ? (open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />) : null}</div>
      </Button>
      {open && hasDetail && (
        <div className="grid grid-cols-1 gap-4 border-t border-border bg-muted/30 px-4 py-3 md:grid-cols-2">
          <JsonBlock value={log.old_values ?? null} label="Before" maxHeight="max-h-60" className="bg-background" />
          <JsonBlock value={log.new_values ?? null} label="After" maxHeight="max-h-60" className="bg-background" />
        </div>
      )}
    </div>
  );
}
