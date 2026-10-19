import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, ExternalLink, UserPlus, Users, Building2, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PlatformShell } from "@/components/platform/platform-shell";
import { Panel, dayLabel } from "@/components/charts/chart-kit";
import { Columns, RankList } from "@/components/charts/charts";
import { KpiTile } from "@/components/ui/kpi-tile";
import { TablePager } from "@/components/ui/table-pager";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PAGE_SIZES } from "@/lib/use-paged";

export const Route = createFileRoute("/_authenticated/app/platform/insights")({
  head: () => ({ meta: [{ title: "Insights — Platform" }] }),
  component: Insights,
});

type User = { id: string; email: string; name: string | null; created_at: string; last_sign_in_at: string | null; confirmed: boolean; workspaces: { name: string; role: string }[] };
type Workspace = { id: string; name: string; plan: string | null; plan_status: string | null; members: number; created_at: string; last_active: string | null; employee_band: string | null; revenue_band: string | null };
type Data = {
  totals: { users: number; active_7d: number; active_30d: number; signups_30d: number; workspaces: number; workspaces_active_30d: number };
  weeks: { week: string; signups: number; workspaces: number }[];
  plans: { plan: string; workspaces: number }[];
  modules_30d: Record<string, number>;
  workspaces: Workspace[];
  users: User[];
};

const when = (d: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Never");
const POSTHOG_URL = (import.meta.env.VITE_POSTHOG_HOST as string | undefined)?.replace("i.posthog", "posthog") || "https://eu.posthog.com";

function toCsv(rows: string[][]) {
  return rows.map((r) => r.map((c) => `"${String(c ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
}
function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Who uses Inuberry and how: from our own database in one call (DB-28). Page-level traffic lives in PostHog. */
function Insights() {
  const q = useQuery({
    queryKey: ["platform-insights"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("platform_insights");
      if (error) throw error;
      return data as unknown as Data;
    },
  });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState<number>(PAGE_SIZES[0]);
  const users = useMemo(() => {
    const s = search.trim().toLowerCase();
    const all = q.data?.users ?? [];
    return s ? all.filter((u) => `${u.email} ${u.name ?? ""} ${u.workspaces.map((w) => w.name).join(" ")}`.toLowerCase().includes(s)) : all;
  }, [q.data, search]);

  const missing = q.error && /PGRST202|42883|platform_insights/.test(JSON.stringify(q.error));
  const t = q.data?.totals;

  return (
    <PlatformShell title="Insights" breadcrumb="platform · insights">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          People, workspaces and module use from Inuberry's own database. Page views, funnels and session replays are in PostHog.
        </p>
        <a href={POSTHOG_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
          Open PostHog <ExternalLink className="size-3.5" />
        </a>
      </div>

      {missing ? (
        <div className="border border-warning/40 bg-warning/10 p-4 text-sm">Insights need database update DB-28. Apply it in Lovable, then reload this page.</div>
      ) : q.error ? (
        <div className="border border-destructive/40 bg-destructive/10 p-4 text-sm">Couldn't load insights. Reload to try again.</div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile icon={<Users />} label="People" value={t?.users ?? "—"} hint={t ? `${t.active_30d} signed in this month` : undefined} />
            <KpiTile icon={<Activity />} label="Active this week" value={t?.active_7d ?? "—"} />
            <KpiTile icon={<UserPlus />} label="Sign-ups, 30 days" value={t?.signups_30d ?? "—"} />
            <KpiTile icon={<Building2 />} label="Workspaces" value={t?.workspaces ?? "—"} hint={t ? `${t.workspaces_active_30d} active this month` : undefined} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Panel title="Sign-ups per week" hint="New people (bars) and new workspaces (line), last 12 weeks">
                <Columns data={(q.data?.weeks ?? []).map((w) => ({ ...w, label: dayLabel(w.week) }))} x="label"
                  bar={{ key: "signups", label: "People", color: "var(--chart-1)" }}
                  line={{ key: "workspaces", label: "Workspaces", color: "var(--chart-2)" }} />
              </Panel>
            </div>
            <Panel title="Module use" hint="Records created in the last 30 days, all workspaces">
              <RankList data={Object.entries(q.data?.modules_30d ?? {}).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)} />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Plans" hint="Workspaces on each plan">
              <RankList data={(q.data?.plans ?? []).map((p) => ({ label: p.plan, value: p.workspaces }))} />
            </Panel>
            <div className="lg:col-span-2">
              <Panel title="Workspaces" hint="Most recently active first">
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card font-mono text-xs uppercase tracking-widest text-muted-foreground">
                      <tr><th className="py-2 text-left">Name</th><th className="px-2 text-left">Plan</th><th className="px-2 text-right">People</th><th className="px-2 text-left">Size</th><th className="text-left">Last active</th></tr>
                    </thead>
                    <tbody>
                      {(q.data?.workspaces ?? []).map((w) => (
                        <tr key={w.id} className="border-t border-border">
                          <td className="py-2">{w.name}</td>
                          <td className="px-2">{w.plan ?? "None"}{w.plan_status && w.plan_status !== "active" ? <span className="text-muted-foreground"> · {w.plan_status}</span> : null}</td>
                          <td className="px-2 text-right tabular-nums">{w.members}</td>
                          <td className="px-2 text-muted-foreground">{[w.employee_band, w.revenue_band].filter(Boolean).join(" · ") || "—"}</td>
                          <td>{when(w.last_active)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>
          </div>

          <section className="border border-border bg-card shadow-sm p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">People</h2>
                <p className="text-xs text-muted-foreground">Everyone with an account, most recent sign-in first</p>
              </div>
              <div className="flex gap-2">
                <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search email, name or workspace" className="h-9 w-64" aria-label="Search people" />
                <Button variant="outline" size="sm" className="h-9 gap-1" disabled={!users.length}
                  onClick={() => download(`inuberry-people-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
                    ["Email", "Name", "Signed up", "Last sign-in", "Email confirmed", "Workspaces"],
                    ...users.map((u) => [u.email, u.name ?? "", u.created_at, u.last_sign_in_at ?? "", u.confirmed ? "yes" : "no", u.workspaces.map((w) => `${w.name} (${w.role})`).join("; ")]),
                  ]))}>
                  <Download className="size-3.5" /> CSV
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  <tr><th className="py-2 text-left">Email</th><th className="px-2 text-left">Name</th><th className="px-2 text-left">Workspaces</th><th className="px-2 text-left">Signed up</th><th className="text-left">Last sign-in</th></tr>
                </thead>
                <tbody>
                  {q.isLoading && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Loading…</td></tr>}
                  {users.slice(page * size, page * size + size).map((u) => (
                    <tr key={u.id} className="border-t border-border">
                      <td className="py-2">{u.email}{!u.confirmed && <span className="ml-1 text-xs text-muted-foreground">(unconfirmed)</span>}</td>
                      <td className="px-2">{u.name ?? "—"}</td>
                      <td className="px-2 text-muted-foreground">{u.workspaces.map((w) => w.name).join(", ") || "—"}</td>
                      <td className="px-2">{when(u.created_at)}</td>
                      <td>{when(u.last_sign_in_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3"><TablePager page={page} size={size} total={users.length} onPage={setPage} onSize={(n) => { setSize(n); setPage(0); }} /></div>
          </section>
        </div>
      )}
    </PlatformShell>
  );
}
