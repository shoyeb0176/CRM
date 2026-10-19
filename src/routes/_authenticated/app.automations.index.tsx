import { AppShell } from "@/components/app/app-shell";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { BellRing, Workflow, Plus, Play } from "lucide-react";
import { useWorkflows, useWorkflowMutations } from "@/lib/workflows/use-workflows";
import { WORKFLOW_TEMPLATES, ENTITY_LABEL } from "@/lib/workflows/workflow-model";

import { friendlyError } from "@/lib/friendly-error";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/_authenticated/app/automations/")({
  head: () => ({
    meta: [
      { title: "Automations — Inuberry" },
      { name: "description", content: "Build WHEN / IF / THEN workflows that watch your records and act for you." },
      { property: "og:title", content: "Automations — Inuberry" },
      { property: "og:description", content: "Build workflows that watch your records and act for you." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AutomationsPage,
});

function AutomationsIndex() {
  const navigate = useNavigate();
  const { data: workflows, isLoading } = useWorkflows();
  const { create } = useWorkflowMutations();
  const [name, setName] = useState("");

  const start = async (templateId: string) => {
    const tpl = WORKFLOW_TEMPLATES.find((t) => t.id === templateId)!;
    try {
      const id = await create.mutateAsync({
        name: name.trim() || tpl.label,
        entity: tpl.entity,
        conditions: tpl.conditions,
        actions: tpl.actions,
      });
      setName("");
      void navigate({ to: "/app/automations/$workflowId", params: { workflowId: id } });
    } catch (e) {
      toast.error(friendlyError(e, "Could not create workflow"));
    }
  };

  return (
    <div>
      <div className="mb-6 grid gap-px border border-border bg-border sm:grid-cols-2">
        <div className="bg-card p-4">
          <div className="flex items-center gap-2 font-heading text-sm"><Workflow className="size-4 text-primary" /> Workflows</div>
          <p className="mt-1 text-sm text-muted-foreground">When something happens (a deal is won, an invoice is paid), do something: notify someone, create a task, update a record.</p>
        </div>
        <Link to="/app/settings/automations" className="bg-card p-4 hover:bg-accent">
          <div className="flex items-center gap-2 font-heading text-sm"><BellRing className="size-4 text-primary" /> Daily alerts</div>
          <p className="mt-1 text-sm text-muted-foreground">Checks that run every morning: overdue invoices, low stock, stale deals, late tasks. Set them in Settings › Alert rules.</p>
        </Link>
      </div>

      <section className="mb-8 border border-border p-4 bg-card shadow-sm">
        <div className="mb-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">New workflow</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Workflow name (optional)"
          className="mb-3 w-full max-w-md border border-input bg-card shadow-xs px-3 py-2 text-sm"
        />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {WORKFLOW_TEMPLATES.map((t) => (
            <Button variant="bare" size="bare"
              key={t.id}
              onClick={() => void start(t.id)}
              disabled={create.isPending}
              className="border border-border p-3 text-left transition-colors hover:border-primary disabled:opacity-50"
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <Plus className="size-3" /> {t.label}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{t.description}</div>
            </Button>
          ))}
        </div>
      </section>

      <section className="border border-border">
        <div className="border-b border-border p-4 font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Your workflows
        </div>
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        ) : !workflows?.length ? (
          <div className="p-6 text-sm text-muted-foreground">No workflows yet. Pick a starting point above.</div>
        ) : (
          <div className="divide-y divide-border">
            {workflows.map((w) => (
              <Link
                key={w.id}
                to="/app/automations/$workflowId"
                params={{ workflowId: w.id }}
                className="flex items-center justify-between gap-3 p-4 hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{w.name}</span>
                    <span className="border border-border px-1.5 py-0.5 font-mono text-xs uppercase">
                      {ENTITY_LABEL[w.entity] ?? w.entity}
                    </span>
                    {w.is_active ? (
                      <span className="bg-primary/10 px-1.5 py-0.5 font-mono text-xs uppercase text-primary">On</span>
                    ) : (
                      <span className="bg-muted px-1.5 py-0.5 font-mono text-xs uppercase text-muted-foreground">Off</span>
                    )}
                  </div>
                  <div className="mt-1 font-mono text-xs uppercase text-muted-foreground">
                    {w.conditions?.length ?? 0} condition(s) · {w.actions?.length ?? 0} action(s) · last run{" "}
                    {w.last_run_at ? new Date(w.last_run_at).toLocaleString() : "never"}
                  </div>
                </div>
                <Play className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AutomationsPage() {
  return (
    <AppShell title="Automations" breadcrumb="automations">
      <AutomationsIndex />
    </AppShell>
  );
}
