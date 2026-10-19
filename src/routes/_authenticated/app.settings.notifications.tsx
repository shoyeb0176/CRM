import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { SettingsShell } from "@/components/settings/settings-shell";
import { SidebarModulesCard } from "@/components/settings/sidebar-modules";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/lib/crm/use-org";
import { useCurrentUser } from "@/lib/use-current-user";
import { GROUP_LABELS, KINDS, type NotificationGroup } from "@/lib/notifications/kinds";
import { notificationEmailStatus } from "@/lib/notifications/notifications.functions";

import { SectionTitle } from "@/components/ui/section-title";
export const Route = createFileRoute("/_authenticated/app/settings/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Settings" }] }),
  component: NotificationSettingsPage,
});

type Pref = { kind: string; in_app: boolean; email: boolean | null };

function NotificationSettingsPage() {
  const orgId = useOrgId();
  const user = useCurrentUser();
  const qc = useQueryClient();
  const statusFn = useServerFn(notificationEmailStatus);

  const prefs = useQuery({
    enabled: !!user?.id,
    queryKey: ["notification-prefs", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("notification_preferences").select("kind,in_app,email").eq("user_id", user!.id);
      return new Map(((data ?? []) as Pref[]).map((p) => [p.kind, p]));
    },
  });
  const status = useQuery({
    enabled: !!orgId,
    queryKey: ["notification-email-status", orgId],
    queryFn: () => statusFn({ data: { orgId: orgId! } }),
  });

  const save = useMutation({
    mutationFn: async (p: Pref) => {
      const { error } = await supabase.from("notification_preferences")
        .upsert({ user_id: user!.id, kind: p.kind, in_app: p.in_app, email: p.email, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-prefs"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const groups = Object.keys(GROUP_LABELS) as NotificationGroup[];
  const via = status.data?.via;

  return (
    <SettingsShell title="Notifications" breadcrumb="settings / notifications">
      <div className="max-w-3xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Pick what reaches your bell and your inbox. These settings are yours: teammates choose their own.
          Security notices and support-access requests always come through.
        </p>

        <div className="border border-border bg-card shadow-sm p-4 text-sm">
          <div className="font-medium">Email delivery</div>
          <p className="mt-1 text-muted-foreground">
            {via === "platform" && "Emails come from Inuberry's mailbox."}
            {via === "workspace" && <>Emails come from this workspace's mailbox ({status.data && "from" in status.data ? status.data.from : ""}).</>}
            {via === "none" && <>No mailbox is set up, so notifications stay in the app. An owner can add one in <Link to="/app/settings/email" className="text-primary hover:underline">Settings › Email</Link>.</>}
            {!via && "Checking…"}
          </p>
        </div>

        {groups.map((g) => {
          const kinds = Object.entries(KINDS).filter(([, v]) => v.group === g);
          return (
            <section key={g} className="border border-border bg-card">
              <div className="grid grid-cols-[minmax(0,1fr)_64px_64px] items-center gap-2 border-b border-border px-4 py-2">
                <SectionTitle>{GROUP_LABELS[g]}</SectionTitle>
                <span className="text-center text-xs text-muted-foreground">In app</span>
                <span className="text-center text-xs text-muted-foreground">Email</span>
              </div>
              {kinds.map(([kind, info]) => {
                const p = prefs.data?.get(kind);
                const inApp = info.locked ? true : (p?.in_app ?? true);
                const email = info.locked ? true : (p?.email ?? info.email);
                const Icon = info.icon;
                return (
                  <div key={kind} className="grid grid-cols-[minmax(0,1fr)_64px_64px] items-center gap-2 border-b border-border/60 px-4 py-2.5 last:border-b-0">
                    <div className="flex min-w-0 items-center gap-2 text-sm">
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{info.label}</span>
                      {info.locked && <Lock className="size-3 shrink-0 text-muted-foreground" aria-label="Always on" />}
                    </div>
                    <Toggle label={`${info.label}: in app`} checked={inApp} disabled={info.locked}
                      onChange={(v) => save.mutate({ kind, in_app: v, email: p?.email ?? null })} />
                    <Toggle label={`${info.label}: email`} checked={email && inApp} disabled={info.locked || !inApp}
                      onChange={(v) => save.mutate({ kind, in_app: inApp, email: v })} />
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
      <div className="mt-6"><SidebarModulesCard /></div>
    </SettingsShell>
  );
}

function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <label className="flex justify-center">
      <input type="checkbox" aria-label={label} className="size-4 accent-[var(--color-primary)]"
        checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
