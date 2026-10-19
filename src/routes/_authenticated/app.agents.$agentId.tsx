import { MODULE_LABELS } from "@/lib/agents/tool-registry";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Markdown } from "@/components/ai/markdown";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AgentsShell } from "@/components/agents/agents-shell";
import { supabase } from "@/integrations/supabase/client";
import {
  useAgent, useAgentRuns, useAgentActions, useAgentTools,
  useAgentPermissions, useAgentAuditLogs, useAgentMessages, AGENT_STATUS_TONE,
} from "@/lib/agents/use-agents";
import { runAgent, writeAgentAuditLog, decideAgentAction } from "@/lib/agents/agent-service";
import { StatusBadge } from "@/components/crm/status-badge";
import { RejectActionDialog } from "@/components/agents/reject-dialog";
import { TOOL_REGISTRY } from "@/lib/agents/tool-registry";
import { useOrgRole } from "@/lib/crm/use-org";
import { Switch } from "@/components/ui/switch";
import { Bot, Play, Pause, Archive, ShieldAlert, Send } from "lucide-react";
import { JsonBlock } from "@/components/ui/code-block";
import { Button } from "@/components/ui/button";

import { friendlyError } from "@/lib/friendly-error";
const sb = supabase;

export const Route = createFileRoute("/_authenticated/app/agents/$agentId")({
  head: () => ({ meta: [{ title: "Agent — Inuberry" }] }),
  component: AgentDetailPage,
});

const TABS = ["Overview","Chat","Runs","Actions","Permissions","Tools","Audit"] as const;
type Tab = typeof TABS[number];

function AgentDetailPage() {
  const { agentId } = Route.useParams();
  const agent = useAgent(agentId);
  const [tab, setTab] = useState<Tab>("Overview");

  if (agent.isLoading) {
    return <AgentsShell title="Agent"><div className="p-8 text-sm text-muted-foreground">Loading…</div></AgentsShell>;
  }
  if (!agent.data) {
    return <AgentsShell title="Agent not found"><div className="p-8 text-sm text-muted-foreground">This agent doesn't exist or you don't have access.</div></AgentsShell>;
  }
  const a = agent.data;

  return (
    <AgentsShell title={a.name} breadcrumb={`AI Agents / ${a.name}`}>
      <Header agent={a} />
      <nav className="mt-6 flex flex-wrap gap-2 border-b border-border pb-3">
        {TABS.map((t) => (
          <Button variant="bare" size="bare"
            key={t}
            onClick={() => setTab(t)}
            className={`border px-3 py-1.5 font-mono text-xs uppercase tracking-widest ${t === tab ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground"}`}
          >{t}</Button>
        ))}
      </nav>
      <div className="mt-4">
        {tab === "Overview"    && <OverviewTab agent={a} />}
        {tab === "Chat"        && <ChatTab agentId={a.id} />}
        {tab === "Runs"        && <RunsTab agentId={a.id} />}
        {tab === "Actions"     && <ActionsTab agentId={a.id} />}
        {tab === "Permissions" && <PermsTab agentId={a.id} />}
        {tab === "Tools"       && <ToolsTab agentId={a.id} />}
        {tab === "Audit"       && <AuditTab agentId={a.id} />}
      </div>
    </AgentsShell>
  );
}

function Header({ agent }: { agent: any }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  async function setStatus(status: "active" | "paused" | "archived") {
    const { error } = await sb.from("ai_agents").update({ status }).eq("id", agent.id);
    if (error) { toast.error(error.message); return; }
    await writeAgentAuditLog({
      agentId: agent.id,
      event_type: status === "active" ? "agent_activated" : status === "paused" ? "agent_paused" : "agent_updated",
      description: `Status set to ${status}`,
    });
    toast.success(`Agent ${status}`);
    qc.invalidateQueries({ queryKey: ["ai-agent", agent.id] });
    if (status === "archived") navigate({ to: "/app/agents/list" });
  }
  return (
    <div className="flex flex-col gap-4 border border-border bg-card shadow-sm p-5 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-3">
        <div className="grid size-12 place-items-center border border-border bg-background"><Bot className="size-5" /></div>
        <div>
          <h1 className="font-display text-2xl">{agent.name}</h1>
          <p className="text-sm text-muted-foreground">{agent.description || "—"}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <StatusBadge tone={AGENT_STATUS_TONE[agent.status] ?? "default"}>{agent.status}</StatusBadge>
            <StatusBadge tone="neutral">{agent.agent_type}</StatusBadge>
            <StatusBadge tone="info">{agent.model_provider}/{agent.model_name}</StatusBadge>
            {agent.requires_approval && <StatusBadge tone="warning">Requires approval</StatusBadge>}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {agent.status !== "active" && <Button variant="kit" size="kit" onClick={() => setStatus("active")} className="gap-1 border-success/40 bg-success/10 px-3 py-1.5 text-success hover:bg-success/20"><Play className="size-3" /> Activate</Button>}
        {agent.status === "active" && <Button variant="kit" size="kit" onClick={() => setStatus("paused")} className="gap-1 border-warning/40 bg-warning/10 px-3 py-1.5 text-warning hover:bg-warning/20"><Pause className="size-3" /> Pause</Button>}
        {agent.status !== "archived" && <Button variant="kit" size="kit" onClick={() => setStatus("archived")} className="gap-1 px-3 py-1.5 hover:bg-accent"><Archive className="size-3" /> Archive</Button>}
      </div>
    </div>
  );
}

function OverviewTab({ agent }: { agent: any }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="border border-border bg-card shadow-sm p-4">
        <h3 className="mb-2 font-heading text-sm uppercase">System prompt</h3>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words bg-muted p-3 text-xs text-foreground/90">{agent.system_prompt || "(empty)"}</pre>
      </section>
      <section className="border border-border bg-card shadow-sm p-4">
        <h3 className="mb-2 font-heading text-sm uppercase">Safety</h3>
        <ul className="space-y-1 text-sm">
          <li>Requires approval: <strong>{agent.requires_approval ? "Yes" : "No"}</strong></li>
          <li>Memory enabled: <strong>{agent.memory_enabled ? "Yes" : "No"}</strong></li>
          <li>Last run: {agent.last_run_at ? new Date(agent.last_run_at).toLocaleString() : "—"}</li>
          <li>Created: {new Date(agent.created_at).toLocaleString()}</li>
        </ul>
      </section>
    </div>
  );
}

function ChatTab({ agentId }: { agentId: string }) {
  const [runId, setRunId] = useState<string | undefined>(undefined);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const messages = useAgentMessages(runId);
  const qc = useQueryClient();

  async function send() {
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      const res = await runAgent(agentId, { prompt: prompt.trim() });
      setRunId(res.runId);
      setPrompt("");
      await qc.invalidateQueries({ queryKey: ["ai-agent-messages", res.runId] });
      qc.invalidateQueries({ queryKey: ["ai-agent-actions"] });
      qc.invalidateQueries({ queryKey: ["ai-agent-approvals"] });
      if (res.error) toast.error(res.error);
      else if (res.proposals) toast.info("Action waiting for approval");
    } catch (err) {
      toast.error(friendlyError(err, "Run failed"));
    } finally { setBusy(false); }
  }

  return (
    <div className="grid gap-3">
      <div className="border border-border bg-card shadow-sm p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldAlert className="size-3" /> This console runs the agent in your organisation's context. Read-only lookups run immediately; anything that changes data waits for approval.
        </div>
      </div>
      <div className="max-h-[420px] min-h-[200px] space-y-2 overflow-y-auto border border-border bg-card shadow-sm p-4">
        {(messages.data ?? []).length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Start a conversation below to test this agent.</div>
        ) : (messages.data ?? []).map((m) => (
          m.role === "system" ? null : (
          <div key={m.id} className="text-sm">
            <div className={`font-mono text-xs uppercase tracking-widest ${m.role === "error" ? "text-destructive" : "text-muted-foreground"}`}>{m.role === "tool" ? "tool call" : m.role}</div>
            {m.role === "assistant"
              ? <Markdown>{m.content}</Markdown>
              : <div className={`whitespace-pre-wrap ${m.role === "error" ? "text-destructive" : m.role === "tool" ? "font-mono text-xs text-muted-foreground" : ""}`}>{m.content}</div>}
          </div>
        )))}
      </div>
      <div className="flex gap-2">
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask the agent…" className="min-h-[60px] flex-1 border border-input bg-card shadow-xs p-2 text-sm focus:border-foreground focus:outline-none" />
        <Button variant="kitSolid" size="kit" onClick={send} disabled={busy || !prompt.trim()} className="self-end px-4 py-2">
          <Send className="size-3" /> {busy ? "Running…" : "Send"}
        </Button>
      </div>
    </div>
  );
}

function RunsTab({ agentId }: { agentId: string }) {
  const runs = useAgentRuns(agentId);
  if (runs.isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
  if (!runs.data?.length) return <div className="p-8 text-center text-sm text-muted-foreground">No runs yet.</div>;
  return (
    <ul className="divide-y divide-border border border-border bg-card">
      {runs.data.map((r) => (
        <li key={r.id} className="flex items-center justify-between px-4 py-2 text-sm">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{r.trigger_type} · {new Date(r.created_at).toLocaleString()}</div>
            <div className="line-clamp-1">{r.output_summary || r.error_message || "(no output)"}</div>
          </div>
          <StatusBadge tone={AGENT_STATUS_TONE[r.status] ?? "default"}>{r.status}</StatusBadge>
        </li>
      ))}
    </ul>
  );
}

function ActionsTab({ agentId }: { agentId: string }) {
  const actions = useAgentActions(agentId);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  async function decide(id: string, kind: "approve" | "reject", reason?: string) {
    setBusy(id);
    try {
      if (kind === "approve") {
        const res = await decideAgentAction(id, "approve");
        if (res.status === "executed") toast.success("Approved and done");
        else toast.error(("error" in res && res.error) || "The action didn't run");
      } else {
        await decideAgentAction(id, "reject", reason);
        toast.success("Rejected");
        setRejecting(null);
      }
    } catch (err) {
      toast.error(friendlyError(err, "Failed"));
    } finally {
      setBusy(null);
      qc.invalidateQueries({ queryKey: ["ai-agent-actions"] });
      qc.invalidateQueries({ queryKey: ["ai-agent-approvals"] });
    }
  }
  if (!actions.data?.length) return <div className="p-8 text-center text-sm text-muted-foreground">No proposed actions yet.</div>;
  return (
    <>
    <RejectActionDialog open={!!rejecting} onOpenChange={(v) => { if (!v) setRejecting(null); }}
      loading={!!rejecting && busy === rejecting}
      onConfirm={(reason) => { if (rejecting) void decide(rejecting, "reject", reason); }} />
    <ul className="divide-y divide-border border border-border bg-card">
      {actions.data.map((a) => (
        <li key={a.id} className="px-4 py-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium">{a.action_type}</span>
            <StatusBadge tone={AGENT_STATUS_TONE[a.status] ?? "default"}>{a.status}</StatusBadge>
          </div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{a.target_module ?? "—"} · {new Date(a.created_at).toLocaleString()}</div>
          {a.proposed_changes_json && Object.keys(a.proposed_changes_json).length > 0 && (
            <JsonBlock value={a.proposed_changes_json} label="Proposed changes" maxHeight="max-h-40" className="mt-2" />
          )}
          {a.error_message && <div className="mt-1 text-xs text-destructive">{a.error_message}</div>}
          {a.status === "pending_approval" && (
            <div className="mt-2 flex gap-2">
              <Button variant="kit" size="kit" disabled={busy === a.id} onClick={() => setRejecting(a.id)} className="px-3 py-1 hover:bg-accent">Reject</Button>
              <Button variant="kitSolid" size="kit" disabled={busy === a.id} onClick={() => decide(a.id, "approve")} className="px-3 py-1">Approve & execute</Button>
            </div>
          )}
        </li>
      ))}
    </ul>
    </>
  );
}

function PermsTab({ agentId }: { agentId: string }) {
  const perms = useAgentPermissions(agentId);
  if (!perms.data?.length) return <div className="p-8 text-center text-sm text-muted-foreground">No module permissions granted.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border border-border bg-card text-sm">
        <thead className="border-b border-border font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <tr><th className="px-3 py-2.5 text-left">Module</th>{["Read", "Create", "Update", "Delete", "Execute"].map((h) => <th key={h} className="px-3 py-2.5 text-center">{h}</th>)}</tr>
        </thead>
        <tbody>
          {perms.data.map((p) => (
            <tr key={p.id} className="border-b border-border">
              <td className="px-3 py-2.5">{MODULE_LABELS[p.module_key] ?? p.module_key}</td>
              <td className="text-center">{p.can_read ? "✓" : "—"}</td>
              <td className="text-center">{p.can_create ? "✓" : "—"}</td>
              <td className="text-center">{p.can_update ? "✓" : "—"}</td>
              <td className="text-center">{p.can_delete ? "✓" : "—"}</td>
              <td className="text-center">{p.can_execute_action ? "✓" : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ToolsTab({ agentId }: { agentId: string }) {
  const tools = useAgentTools(agentId);
  const role = useOrgRole();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const canEdit = role === "org_owner" || role === "org_admin";
  const rows = (tools.data ?? []) as any[];
  const byName = new Map(rows.map((t) => [t.tool_name, t]));
  const extra = rows.filter((t) => !TOOL_REGISTRY.some((d) => d.name === t.tool_name));

  async function toggle(name: string, enabled: boolean) {
    const def = TOOL_REGISTRY.find((d) => d.name === name);
    const existing = byName.get(name);
    setBusy(name);
    try {
      if (existing) {
        const { error } = await supabase.from("ai_agent_tools").update({ is_enabled: enabled }).eq("id", existing.id);
        if (error) throw error;
      } else if (def) {
        const { data: agent, error: aErr } = await supabase.from("ai_agents").select("org_id").eq("id", agentId).single();
        if (aErr) throw aErr;
        const { error } = await supabase.from("ai_agent_tools").insert({
          org_id: agent.org_id, agent_id: agentId, tool_name: def.name, tool_type: def.toolType,
          description: def.description, requires_approval: def.requiresApproval, is_enabled: enabled,
        });
        if (error) throw error;
      }
      toast.success(`${def?.label ?? name} ${enabled ? "enabled" : "disabled"}`);
      qc.invalidateQueries({ queryKey: ["ai-agent-tools"] });
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? "Could not update tool");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      {!canEdit && <p className="text-xs text-muted-foreground">Only workspace owners and admins can change an agent's tools.</p>}
      <ul className="divide-y divide-border border border-border bg-card">
        {TOOL_REGISTRY.map((d) => {
          const t = byName.get(d.name);
          const enabled = !!t?.is_enabled;
          return (
            <li key={d.name} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{d.label} <span className="font-mono text-xs text-muted-foreground">{d.name}</span></div>
                <div className="text-xs text-muted-foreground">{d.description}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge tone="neutral">{d.toolType}</StatusBadge>
                {(t?.requires_approval ?? d.requiresApproval) && <StatusBadge tone="warning">Approval</StatusBadge>}
                <Switch checked={enabled} disabled={!canEdit || busy === d.name}
                  onCheckedChange={(v) => void toggle(d.name, v)} aria-label={`Enable ${d.label}`} />
              </div>
            </li>
          );
        })}
        {extra.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <div>
              <div className="font-medium">{t.tool_name}</div>
              <div className="text-xs text-muted-foreground">{t.description ?? "—"}</div>
            </div>
            <Switch checked={!!t.is_enabled} disabled={!canEdit || busy === t.tool_name}
              onCheckedChange={(v) => void toggle(t.tool_name, v)} aria-label={`Enable ${t.tool_name}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function AuditTab({ agentId }: { agentId: string }) {
  const logs = useAgentAuditLogs(agentId);
  if (!logs.data?.length) return <div className="p-8 text-center text-sm text-muted-foreground">No audit events yet.</div>;
  return (
    <ul className="divide-y divide-border border border-border bg-card">
      {logs.data.map((l) => (
        <li key={l.id} className="px-4 py-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-widest">{l.event_type}</span>
            <span className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
          </div>
          {l.event_description && <div className="text-xs text-muted-foreground">{l.event_description}</div>}
        </li>
      ))}
    </ul>
  );
}
