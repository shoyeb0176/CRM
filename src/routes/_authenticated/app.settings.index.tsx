import { createFileRoute, Link } from "@tanstack/react-router";
import { Stat } from "@/components/ui/kpi-tile";
import { SETTINGS_GROUPS, SETTINGS_SECTIONS, SettingsShell } from "@/components/settings/settings-shell";
import { useAdminContext } from "@/lib/settings/use-admin";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/settings/")({
  head: () => ({ meta: [{ title: "Settings — Inuberry" }] }),
  component: SettingsOverview,
});

function SettingsOverview() {
  const { membership, orgId } = useAdminContext();

  const stats = useQuery({
    queryKey: ["settings", "overview", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [{ count: members }, { count: taxes }, { count: audits }] = await Promise.all([
        supabase.from("memberships").select("id", { count: "exact", head: true }).eq("org_id", orgId!).eq("status", "active"),
        supabase.from("taxes").select("id", { count: "exact", head: true }).eq("org_id", orgId!).eq("is_active", true),
        supabase.from("audit_logs").select("id", { count: "exact", head: true }).eq("org_id", orgId!),
      ]);
      return { members: members ?? 0, taxes: taxes ?? 0, audits: audits ?? 0 };
    },
  });

  return (
    <SettingsShell title="Settings" breadcrumb="settings">
      <div className="mb-8 border border-border bg-card shadow-sm p-6">
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Workspace</div>
        <div className="mt-1 text-2xl font-semibold">{membership?.organizations.name ?? "—"}</div>
        <div className="mt-4 grid grid-cols-2 gap-6 md:grid-cols-4">
          <Stat label="Currency"   value={membership?.organizations.default_currency ?? "—"} />
          <Stat label="Members"    value={stats.data?.members ?? "—"} />
          <Stat label="Tax rates"  value={stats.data?.taxes ?? "—"} />
          <Stat label="Audit events" value={stats.data?.audits ?? "—"} />
        </div>
      </div>

      <div className="space-y-8">
        {SETTINGS_GROUPS.map((g) => (
          <section key={g}>
            <h2 className="mb-3 font-heading text-sm">{g}</h2>
            <div className="grid grid-cols-1 gap-px border border-border bg-border md:grid-cols-2 xl:grid-cols-3">
              {SETTINGS_SECTIONS.filter((s) => s.group === g).map(({ to, label: title, desc, icon: Icon }) => (
                <Link key={to} to={to} className="group flex gap-3 bg-background p-5 transition-colors hover:bg-foreground/5">
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                  <div>
                    <div className="font-semibold">{title}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{desc}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </SettingsShell>
  );
}

