import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { SettingsShell } from "@/components/settings/settings-shell";
import { useOrgId } from "@/lib/crm/use-org";
import { runAutomationRule } from "@/lib/ai/automation.functions";
import { toast } from "sonner";
import { Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app/settings/automations")({
  head: () => ({ meta: [{ title: "Automations — Settings" }] }),
  component: AutomationsPage,
});

function AutomationsPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const run = useServerFn(runAutomationRule);

  const rules = useQuery({
    enabled: !!orgId,
    queryKey: ["automation-rules", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("automation_rules")
        .select("id,name,description,trigger,is_active,is_system,last_run_at,config")
        .eq("org_id", orgId!).order("name");
      return data ?? [];
    },
  });

  const runs = useQuery({
    enabled: !!orgId,
    queryKey: ["automation-runs", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("automation_runs")
        .select("id,rule_id,status,matches,notifications_created,log,started_at")
        .eq("org_id", orgId!).order("started_at", { ascending: false }).limit(20);
      return data ?? [];
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("automation_rules").update({ is_active: active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automation-rules"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const runRule = useMutation({
    mutationFn: async (ruleId: string) => await run({ data: { ruleId } }),
    onSuccess: (res) => {
      toast.success(`Ran rule: ${res.created} new notifications from ${res.matches} matches`);
      qc.invalidateQueries({ queryKey: ["automation-runs"] });
      qc.invalidateQueries({ queryKey: ["automation-rules"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SettingsShell title="Automations" breadcrumb="settings / automations">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="border border-border">
          <div className="border-b border-border p-4 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Automation rules
          </div>
          <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
            Active rules run automatically every day at 06:00 UTC and notify the right people. Use Run now to check straight away.
          </p>
          {rules.isLoading ? <div className="p-4 text-sm text-muted-foreground">Loading…</div> :
           !rules.data?.length ? <div className="p-4 text-sm text-muted-foreground">No rules.</div> : (
            <div className="divide-y divide-border">
              {rules.data.map(r => (
                <div key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{r.name}</span>
                        {r.is_system && <span className="bg-muted px-1.5 py-0.5 font-mono text-xs uppercase text-muted-foreground">System</span>}
                        <span className="border border-border px-1.5 py-0.5 font-mono text-xs uppercase">{r.trigger}</span>
                      </div>
                      {r.description && <div className="mt-1 text-xs text-muted-foreground">{r.description}</div>}
                      <div className="mt-1 font-mono text-xs uppercase text-muted-foreground">
                        Last run: {r.last_run_at ? new Date(r.last_run_at).toLocaleString() : "never"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="kitSolid" size="kit"
                        onClick={() => runRule.mutate(r.id)} disabled={runRule.isPending}
                        className="flex gap-1 px-2 py-1"
                      >
                        {runRule.isPending ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
                        Run now
                      </Button>
                      <label className="flex items-center gap-2 font-mono text-xs uppercase">
                        <input type="checkbox" checked={r.is_active}
                          onChange={(e) => toggle.mutate({ id: r.id, active: e.target.checked })} />
                        Active
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="border border-border">
          <div className="border-b border-border p-4 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Recent runs
          </div>
          {!runs.data?.length ? <div className="p-4 text-sm text-muted-foreground">No runs yet.</div> : (
            <div className="divide-y divide-border">
              {runs.data.map(r => (
                <div key={r.id} className="p-3 text-xs">
                  <div className="flex justify-between">
                    <span className={`font-mono uppercase ${r.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>{r.status}</span>
                    <span className="text-muted-foreground">{new Date(r.started_at).toLocaleString()}</span>
                  </div>
                  <div className="mt-1">{r.matches} matched · {r.notifications_created} notifications</div>
                  {r.log && <div className="mt-1 text-muted-foreground">{r.log}</div>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </SettingsShell>
  );
}
