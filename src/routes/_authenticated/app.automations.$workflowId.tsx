import { AppShell } from "@/components/app/app-shell";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Play, Plus, Trash2 } from "lucide-react";
import { useWorkflow, useWorkflowMutations, useWorkflowRuns } from "@/lib/workflows/use-workflows";
import { runWorkflow } from "@/lib/workflows/workflows.functions";
import {
  ACTION_LABEL,
  ENTITY_FIELDS,
  ENTITY_LABEL,
  OP_LABEL,
  type ConditionOp,
  type WorkflowAction,
  type WorkflowActionType,
  type WorkflowCondition,
  type WorkflowEntity,
} from "@/lib/workflows/workflow-model";
import { Button } from "@/components/ui/button";

import { friendlyError } from "@/lib/friendly-error";
export const Route = createFileRoute("/_authenticated/app/automations/$workflowId")({
  head: () => ({
    meta: [
      { title: "Edit workflow — Inuberry" },
      { name: "description", content: "Define when a workflow runs, which records it matches, and what it does." },
      { property: "og:title", content: "Edit workflow — Inuberry" },
      { property: "og:description", content: "Define conditions and actions for your workflow." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkflowEditorPage,
});

const ENTITIES: WorkflowEntity[] = ["invoice", "deal", "lead", "task", "company", "contact"];
const OPS: ConditionOp[] = ["eq", "neq", "gt", "lt", "contains", "is_empty", "not_empty", "older_than_days"];
const ACTION_TYPES: WorkflowActionType[] = ["notify", "create_task", "log_activity", "webhook"];

function WorkflowEditor() {
  const { workflowId } = Route.useParams();
  const navigate = useNavigate();
  const { data: wf, isLoading } = useWorkflow(workflowId);
  const { data: runs, refetch: refetchRuns } = useWorkflowRuns(workflowId);
  const { update, remove } = useWorkflowMutations();
  const run = useServerFn(runWorkflow);

  const savingRef = useRef(false);
  const [name, setName] = useState("");
  const [entity, setEntity] = useState<WorkflowEntity>("invoice");
  const [conditions, setConditions] = useState<WorkflowCondition[]>([]);
  const [actions, setActions] = useState<WorkflowAction[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!wf) return;
    setName(wf.name);
    setEntity(wf.entity);
    setConditions(wf.conditions ?? []);
    setActions(wf.actions ?? []);
  }, [wf]);

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!wf) return <div className="p-6 text-sm text-muted-foreground">Workflow not found.</div>;

  const save = async (patch?: Record<string, unknown>, quiet = false) => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
    await update.mutateAsync({
      id: workflowId,
      patch: { name, entity, conditions, actions, ...patch },
    });
    if (!quiet) toast.success("Saved", { id: "save-toast" });
    } catch (e) {
      toast.error(friendlyError(e, "Could not save"), { id: "save-toast" });
    } finally {
      savingRef.current = false;
    }
  };

  const execute = async (dryRun: boolean) => {
    setRunning(true);
    try {
      await save(undefined, true);
      const res = await run({ data: { workflowId, dryRun } });
      toast[res.status === "error" ? "error" : "success"](res.log);
    } catch (e) {
      toast.error(friendlyError(e, "Run failed"));
    } finally {
      setRunning(false);
      void refetchRuns();
    }
  };

  const fields = ENTITY_FIELDS[entity];

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 min-w-[240px] border-b border-border bg-transparent pb-1 font-display text-2xl uppercase tracking-tight outline-none focus:border-primary"
        />
        <label className="flex items-center gap-2 font-mono text-xs uppercase">
          <input
            type="checkbox"
            checked={wf.is_active}
            onChange={(e) => void save({ is_active: e.target.checked })}
          />
          Active
        </label>
        <Button variant="kit" size="kit"
          onClick={() => void execute(true)}
          disabled={running}
          className="px-3 py-1.5 hover:border-primary"
        >
          Preview matches
        </Button>
        <Button variant="kitSolid" size="kit"
          onClick={() => void execute(false)}
          disabled={running}
          className="flex gap-1 px-3 py-1.5"
        >
          {running ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />} Run now
        </Button>
        <Button variant="kit" size="kit"
          onClick={(e) => { e.preventDefault(); void save(); }}
          disabled={update.isPending}
          className="px-3 py-1.5 hover:border-primary"
        >
          Save
        </Button>
        <Button variant="kit" size="kit"
          onClick={async () => {
            await remove.mutateAsync(workflowId);
            void navigate({ to: "/app/automations" });
          }}
          className="px-3 py-1.5 text-destructive hover:border-destructive"
        >
          Delete
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <section className="border border-border p-4 bg-card shadow-sm">
            <div className="mb-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">When — watch</div>
            <select
              value={entity}
              onChange={(e) => {
                setEntity(e.target.value as WorkflowEntity);
                setConditions([]);
              }}
              className="border border-input bg-card shadow-xs px-3 py-2 text-sm"
            >
              {ENTITIES.map((e) => (
                <option key={e} value={e}>{ENTITY_LABEL[e]}</option>
              ))}
            </select>
          </section>

          <section className="border border-border p-4 bg-card shadow-sm">
            <div className="mb-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">If — conditions</div>
            <div className="space-y-2">
              {conditions.map((c, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select
                    value={c.field}
                    onChange={(e) => setConditions(conditions.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))}
                    className="border border-input bg-card shadow-xs px-2 py-1 text-xs"
                  >
                    {fields.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <select
                    value={c.op}
                    onChange={(e) => setConditions(conditions.map((x, j) => (j === i ? { ...x, op: e.target.value as ConditionOp } : x)))}
                    className="border border-input bg-card shadow-xs px-2 py-1 text-xs"
                  >
                    {OPS.map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}
                  </select>
                  {c.op !== "is_empty" && c.op !== "not_empty" && (
                    <input
                      value={c.value}
                      onChange={(e) => setConditions(conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                      placeholder="value"
                      className="border border-input bg-card shadow-xs px-2 py-1 text-xs"
                    />
                  )}
                  <Button variant="bare" size="bare" aria-label="Remove condition" onClick={() => setConditions(conditions.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
              {!conditions.length && <div className="text-xs text-muted-foreground">No conditions — every record matches.</div>}
            </div>
            <Button variant="kit" size="kit"
              onClick={() => setConditions([...conditions, { field: fields[0]!, op: "eq", value: "" }])}
              className="mt-3 flex gap-1 px-2 py-1 hover:border-primary"
            >
              <Plus className="size-3" /> Add condition
            </Button>
          </section>

          <section className="border border-border p-4 bg-card shadow-sm">
            <div className="mb-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">Then — actions</div>
            <div className="space-y-3">
              {actions.map((a, i) => (
                <div key={i} className="border border-border p-3 bg-card shadow-sm">
                  <div className="mb-2 flex items-center gap-2">
                    <select
                      value={a.type}
                      onChange={(e) => setActions(actions.map((x, j) => (j === i ? { ...x, type: e.target.value as WorkflowActionType } : x)))}
                      className="border border-input bg-card shadow-xs px-2 py-1 text-xs"
                    >
                      {ACTION_TYPES.map((t) => <option key={t} value={t}>{ACTION_LABEL[t]}</option>)}
                    </select>
                    <Button variant="bare" size="bare" aria-label="Remove action" onClick={() => setActions(actions.filter((_, j) => j !== i))} className="ml-auto text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  {a.type === "webhook" ? (
                    <input
                      value={a.url ?? ""}
                      onChange={(e) => setActions(actions.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                      placeholder="https://example.com/hook"
                      className="w-full border border-input bg-card shadow-xs px-2 py-1 text-xs"
                    />
                  ) : (
                    <div className="space-y-2">
                      <input
                        value={a.title ?? ""}
                        onChange={(e) => setActions(actions.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                        placeholder="Title — use {{field}} to insert record values"
                        className="w-full border border-input bg-card shadow-xs px-2 py-1 text-xs"
                      />
                      <textarea
                        value={a.body ?? ""}
                        onChange={(e) => setActions(actions.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))}
                        placeholder="Message"
                        rows={2}
                        className="w-full border border-input bg-card shadow-xs px-2 py-1 text-xs"
                      />
                    </div>
                  )}
                </div>
              ))}
              {!actions.length && <div className="text-xs text-muted-foreground">No actions yet.</div>}
            </div>
            <Button variant="kit" size="kit"
              onClick={() => setActions([...actions, { type: "notify", title: "", body: "", severity: "info" }])}
              className="mt-3 flex gap-1 px-2 py-1 hover:border-primary"
            >
              <Plus className="size-3" /> Add action
            </Button>
          </section>
        </div>

        <section className="h-fit border border-border">
          <div className="border-b border-border p-4 font-mono text-xs uppercase tracking-wider text-muted-foreground">Recent runs</div>
          {!runs?.length ? (
            <div className="p-4 text-sm text-muted-foreground">No runs yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {runs.map((r) => (
                <div key={r.id} className="p-3 text-xs">
                  <div className="flex justify-between">
                    <span className={`font-mono uppercase ${r.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>{r.status}</span>
                    <span className="text-muted-foreground">{new Date(r.started_at).toLocaleString()}</span>
                  </div>
                  <div className="mt-1">{r.log}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function WorkflowEditorPage() {
  return (
    <AppShell title="Workflow" breadcrumb="automations / workflow">
      <WorkflowEditor />
    </AppShell>
  );
}
