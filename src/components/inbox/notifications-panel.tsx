// Notifications list with filters, Mark all read and paging. Shown in Inbox › Notifications.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOpenNotification, type NotificationRow } from "@/components/app/notifications-bell";
import { TablePager } from "@/components/ui/table-pager";
import { useOrgId } from "@/lib/crm/use-org";
import { useCurrentUser } from "@/lib/use-current-user";
import { GROUP_LABELS, KINDS, kindInfo, timeAgo, type NotificationGroup } from "@/lib/notifications/kinds";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Filter = "all" | "unread" | NotificationGroup;
const FILTERS: Filter[] = ["all", "unread", "approvals", "money", "sales", "work", "team", "security", "system"];
const kindsIn = (g: NotificationGroup) => Object.entries(KINDS).filter(([, v]) => v.group === g).map(([k]) => k);

export function NotificationsPanel() {
  const orgId = useOrgId();
  const user = useCurrentUser();
  const qc = useQueryClient();
  const open = useOpenNotification();
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);

  const list = useQuery({
    enabled: !!orgId,
    queryKey: ["notifications", "page", orgId, filter, page, size],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase.from("notification_events")
        .select("id,org_id,title,body,severity,link,read_at,dismissed_at,created_at,kind,action_label", { count: "exact" })
        .eq("org_id", orgId!).is("dismissed_at", null);
      if (filter === "unread") q = q.is("read_at", null);
      else if (filter !== "all") q = q.in("kind", kindsIn(filter));
      const { data, count } = await q.order("created_at", { ascending: false }).range(page * size, page * size + size - 1);
      return { rows: (data ?? []) as (NotificationRow & { dismissed_at: string | null })[], total: count ?? 0 };
    },
  });

  const update = useMutation({
    mutationFn: async (p: { ids?: string[]; all?: boolean; patch: { read_at?: string | null; dismissed_at?: string } }) => {
      let q = supabase.from("notification_events").update(p.patch);
      q = p.all ? q.eq("org_id", orgId!).eq("user_id", user!.id).is("read_at", null) : q.in("id", p.ids ?? []);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const now = () => new Date().toISOString();
  const rows = list.data?.rows ?? [];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter notifications">
          {FILTERS.map((f) => (
            <Button variant="bare" size="bare" key={f} role="tab" aria-selected={filter === f} onClick={() => { setFilter(f); setPage(0); }}
              className={`border px-2.5 py-1 text-xs ${filter === f ? "border-foreground bg-foreground text-background" : "border-border hover:bg-accent"}`}>
              {f === "all" ? "All" : f === "unread" ? "Unread" : GROUP_LABELS[f]}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="bare" size="bare" onClick={() => update.mutate({ all: true, patch: { read_at: now() } })}
            className="flex items-center gap-1.5 border border-border px-2.5 py-1 text-xs hover:bg-accent">
            <CheckCheck className="size-3.5" /> Mark all read
          </Button>
          <Link to="/app/settings/notifications" className="flex items-center gap-1.5 border border-border px-2.5 py-1 text-xs hover:bg-accent">
            <Settings2 className="size-3.5" /> Settings
          </Link>
        </div>
      </div>

      <div className="border border-border bg-card">
        {list.isLoading ? <div className="p-4 text-sm text-muted-foreground">Loading…</div> :
         !rows.length ? (
          <div className="p-12 text-center">
            <div className="font-heading text-lg">{filter === "unread" ? "Nothing unread" : "Nothing here yet"}</div>
            <p className="mt-1 text-sm text-muted-foreground">Approvals, payments, tasks, alerts and security notices show up here.</p>
          </div>
         ) : rows.map((n) => {
          const info = kindInfo(n.kind);
          const Icon = info.icon;
          return (
            <div key={n.id} className={`flex items-start gap-3 border-b border-border p-4 last:border-b-0 ${!n.read_at ? "bg-primary/5" : ""}`}>
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center border border-border bg-background"><Icon className="size-4" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <div className={!n.read_at ? "font-semibold" : "font-medium"}>{n.title}</div>
                  <div className="text-xs text-muted-foreground" title={new Date(n.created_at).toLocaleString()}>
                    {info.label} · {timeAgo(n.created_at)}
                  </div>
                </div>
                {n.body && <div className="mt-1 text-sm text-muted-foreground">{n.body}</div>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {n.link && (
                    <Button variant="kitSolid" size="kit" onClick={() => open(n)} className="px-2.5 py-1 font-medium">
                      {n.action_label || "Open"}
                    </Button>
                  )}
                  <Button variant="bare" size="bare" onClick={() => update.mutate({ ids: [n.id], patch: { read_at: n.read_at ? null : now() } })}
                    className="border border-border px-2.5 py-1 text-xs hover:bg-accent">
                    Mark {n.read_at ? "unread" : "read"}
                  </Button>
                  <Button variant="bare" size="bare" onClick={() => update.mutate({ ids: [n.id], patch: { dismissed_at: now(), read_at: n.read_at ?? now() } })}
                    className="border border-border px-2.5 py-1 text-xs hover:bg-accent">
                    Dismiss
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <TablePager page={page} size={size} total={list.data?.total ?? 0} onPage={setPage} onSize={(s) => { setSize(s); setPage(0); }} />
    </>
  );
}
