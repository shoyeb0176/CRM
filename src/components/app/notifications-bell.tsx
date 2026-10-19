import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Bell, CheckCheck, Settings2 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, useNavigate } from "@tanstack/react-router";
import { useOrgId } from "@/lib/crm/use-org";
import { useCurrentUser } from "@/lib/use-current-user";
import { kindInfo, linkTarget, timeAgo, URGENT_KINDS } from "@/lib/notifications/kinds";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
export type NotificationRow = {
  id: string; org_id: string; title: string; body: string | null; severity: string; link: string | null;
  read_at: string | null; created_at: string; kind: string | null; action_label: string | null;
};
const COLS = "id,org_id,title,body,severity,link,read_at,created_at,kind,action_label";

const tone: Record<string, string> = {
  error: "text-destructive", warning: "text-warning", success: "text-success", info: "text-foreground",
};

/** Opens a notification's link inside the app (keeps ?action=… and #section). */
export function useOpenNotification() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return async (n: Pick<NotificationRow, "id" | "link" | "read_at">) => {
    if (!n.read_at) {
      await supabase.from("notification_events").update({ read_at: new Date().toISOString() }).eq("id", n.id);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
    if (n.link) navigate(linkTarget(n.link));
  };
}

export function NotificationsBell() {
  const orgId = useOrgId();
  const user = useCurrentUser();
  const qc = useQueryClient();
  const open = useOpenNotification();

  const list = useQuery({
    enabled: !!orgId,
    queryKey: ["notifications", "bell", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("notification_events").select(COLS)
        .eq("org_id", orgId!).is("dismissed_at", null)
        .order("created_at", { ascending: false }).limit(30);
      return (data ?? []) as NotificationRow[];
    },
    refetchInterval: 60_000,
  });

  // True unread counts (the list above only holds the latest 30).
  const counts = useQuery({
    enabled: !!orgId && !!user?.id,
    queryKey: ["notifications", "count", orgId],
    queryFn: async () => {
      const unread = (q: ReturnType<typeof base>) => q.then((r) => r.count ?? 0);
      const base = () => supabase.from("notification_events").select("id", { count: "exact", head: true })
        .eq("user_id", user!.id).is("read_at", null).is("dismissed_at", null);
      const [here, elsewhere] = await Promise.all([unread(base().eq("org_id", orgId!)), unread(base().neq("org_id", orgId!))]);
      return { here, elsewhere };
    },
    refetchInterval: 60_000,
  });

  // New notifications arrive live; urgent ones also pop up. Due emails are sent while someone is online.
  useEffect(() => {
    if (!user?.id || !orgId) return;
    const flush = () => import("@/lib/notifications/notifications.functions")
      .then(({ flushNotificationEmails }) => flushNotificationEmails({ data: { orgId } })).catch(() => {});
    // A fresh name each time: removing the previous channel finishes later, and reusing its name hands
    // back that already-subscribed channel, where adding a listener throws and takes the page down.
    const ch = supabase.channel(`notifications-${user.id}-${Math.random().toString(36).slice(2, 10)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notification_events", filter: `user_id=eq.${user.id}` },
        (p) => {
          const n = p.new as NotificationRow;
          qc.invalidateQueries({ queryKey: ["notifications"] });
          qc.invalidateQueries({ queryKey: ["attention"] });
          if (n.org_id === orgId && n.kind && URGENT_KINDS.has(n.kind)) {
            toast(n.title, {
              description: n.body ?? undefined,
              action: n.link ? { label: n.action_label || "Open", onClick: () => open(n) } : undefined,
              duration: 12_000,
            });
          }
          flush();
        })
      .subscribe();
    const t = setInterval(flush, 5 * 60_000);
    flush();
    return () => { clearInterval(t); supabase.removeChannel(ch); };
  }, [user?.id, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("notification_events").update({ read_at: new Date().toISOString() })
        .eq("org_id", orgId!).eq("user_id", user!.id).is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const unread = counts.data?.here ?? 0;
  const elsewhere = counts.data?.elsewhere ?? 0;
  const items = list.data ?? [];
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const today = items.filter((n) => new Date(n.created_at) >= startOfToday);
  const earlier = items.filter((n) => new Date(n.created_at) < startOfToday);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="bare" size="bare" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className="relative flex size-9 items-center justify-center border border-border hover:bg-accent">
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center bg-primary px-1 font-mono text-xs text-primary-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(26rem,calc(100vw-2rem))] rounded-none p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">Notifications{unread ? ` · ${unread} new` : ""}</span>
          <div className="flex items-center gap-1">
            {unread > 0 && (
              <Button variant="bare" size="bare" onClick={() => markAll.mutate()} className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                <CheckCheck className="size-3.5" /> Mark all read
              </Button>
            )}
            <Link to="/app/settings/notifications" aria-label="Notification settings" className="p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
              <Settings2 className="size-3.5" />
            </Link>
          </div>
        </div>
        <div className="max-h-[28rem] overflow-y-auto">
          {list.isLoading ? <div className="p-4 text-sm text-muted-foreground">Loading…</div> :
           !items.length ? (
            <div className="p-8 text-center">
              <Bell className="mx-auto size-6 text-muted-foreground" />
              <div className="mt-2 text-sm font-medium">You're all caught up</div>
              <div className="text-xs text-muted-foreground">Approvals, payments, tasks and alerts show up here.</div>
            </div>
           ) : (
            <>
              {today.length > 0 && <GroupLabel>Today</GroupLabel>}
              {today.map((n) => <Item key={n.id} n={n} onOpen={() => open(n)} />)}
              {earlier.length > 0 && <GroupLabel>Earlier</GroupLabel>}
              {earlier.map((n) => <Item key={n.id} n={n} onOpen={() => open(n)} />)}
            </>
           )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs">
          <span className="text-muted-foreground">{elsewhere > 0 ? `${elsewhere} unread in your other workspaces` : ""}</span>
          <Link to="/app/inbox" search={{ tab: "notifications" }} className="font-medium text-primary hover:underline">See all</Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GroupLabel({ children }: { children: string }) {
  return <div className="bg-muted/40 px-3 py-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">{children}</div>;
}

function Item({ n, onOpen }: { n: NotificationRow; onOpen: () => void }) {
  const info = kindInfo(n.kind);
  const Icon = info.icon;
  return (
    <DropdownMenuItem onSelect={onOpen}
      className={`cursor-pointer items-start gap-3 rounded-none border-b border-border/60 px-3 py-3 ${!n.read_at ? "bg-primary/5" : ""}`}>
      <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center border border-border bg-background ${tone[n.severity] ?? ""}`}>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className={`line-clamp-2 flex-1 text-sm ${!n.read_at ? "font-semibold" : "font-medium"}`}>{n.title}</div>
          {!n.read_at && <span className="mt-1.5 size-2 shrink-0 bg-primary" aria-label="Unread" />}
        </div>
        {n.body && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</div>}
        <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{timeAgo(n.created_at)}</span>
          {n.link && <span className="font-medium text-primary">{n.action_label || "Open"} →</span>}
        </div>
      </div>
    </DropdownMenuItem>
  );
}
