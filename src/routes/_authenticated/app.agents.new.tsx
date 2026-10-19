import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { AgentsShell } from "@/components/agents/agents-shell";
import { useOrgId } from "@/lib/crm/use-org";
import { MODULE_KEYS, MODULE_LABELS } from "@/lib/agents/tool-registry";
import { AGENT_TEMPLATES } from "@/lib/agents/agent-templates";
import { AGENT_EVENTS, USABLE_TOOLS, describeTrigger, type AgentSpec, type AgentTrigger, type ScheduleConfig } from "@/lib/agents/agent-spec";
import { createAgentOnServer } from "@/lib/agents/agent-actions.functions";
import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/friendly-error";

const BROWSER_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } })();


export const Route = createFileRoute("/_authenticated/app/agents/new")({
  head: () => ({ meta: [{ title: "New agent — Inuberry" }] }),
  // ?template=key starts from a template; ?draft=… is a spec the assistant prepared ("Open in the wizard").
  validateSearch: (s: Record<string, unknown>): { template?: string; draft?: string } => ({
    ...(typeof s.template === "string" ? { template: s.template } : {}),
    ...(typeof s.draft === "string" ? { draft: s.draft } : {}),
  }),
  component: NewAgentPage,
});

const SECTIONS = [
  "Basic info",
  "Instructions",
  "Data access",
  "Tools",
  "Triggers",
  "Approval rules",
  "Review",
] as const;

function NewAgentPage() {
  const orgId = useOrgId();
  const navigate = useNavigate();
  const { template, draft } = useSearch({ from: Route.id });

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful business assistant scoped to a single organisation. Never act outside your granted modules. Always ask for human approval before performing any sensitive action.");
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [activate, setActivate] = useState(false);

  const [modulePerms, setModulePerms] = useState<Record<string, Record<PermKey, boolean>>>({});
  const [selectedTools, setSelectedTools] = useState<Record<string, boolean>>({});
  const [triggers, setTriggers] = useState<AgentTrigger[]>([{ type: "manual", name: "Manual run" }]);

  // Fill in from a template, or from a draft the assistant prepared.
  useEffect(() => {
    let spec: Partial<AgentSpec> | null = null;
    const t = template ? AGENT_TEMPLATES.find((x) => x.key === template) : undefined;
    if (t) spec = { name: t.name, description: t.description, instructions: t.system_prompt, requires_approval: t.requires_approval, modules: t.modules, tools: t.tools, triggers: t.triggers };
    else if (draft) { try { spec = JSON.parse(decodeURIComponent(escape(atob(draft)))) as Partial<AgentSpec>; } catch { /* a broken link: start blank */ } }
    if (!spec) return;
    setName(spec.name ?? "");
    setDescription(spec.description ?? "");
    if (spec.instructions) setSystemPrompt(spec.instructions);
    setRequiresApproval(spec.requires_approval !== false);
    const mp: typeof modulePerms = {};
    (spec.modules ?? []).forEach((m) => { mp[m.module] = { read: !!m.read, create: !!m.create, update: !!m.update, execute: !!m.execute }; });
    setModulePerms(mp);
    setSelectedTools(Object.fromEntries((spec.tools ?? []).map((n) => [n, true])));
    const trig = (spec.triggers ?? []).map((x) => x.type === "scheduled" ? { ...x, config: { ...x.config, tz: x.config.tz ?? BROWSER_TZ } } : x);
    setTriggers([{ type: "manual", name: "Manual run" }, ...trig.filter((x) => x.type !== "manual")]);
  }, [template, draft]);

  // Set many boxes at once: one module's whole row, one action's whole column, or everything.
  function setPerms(mods: readonly string[], keys: readonly PermKey[], on: boolean) {
    setModulePerms((p) => {
      const next = { ...p };
      for (const m of mods) {
        next[m] = { ...(next[m] ?? { read: false, create: false, update: false, execute: false }) };
        for (const k of keys) next[m][k] = on;
      }
      return next;
    });
  }
  const isOn = (mods: readonly string[], keys: readonly PermKey[]) => {
    const vals = mods.flatMap((m) => keys.map((k) => !!modulePerms[m]?.[k]));
    return { all: vals.every(Boolean), some: vals.some(Boolean) };
  };

  function toggleModule(mod: string, key: PermKey) {
    setModulePerms((p) => {
      const cur = p[mod] ?? { read: false, create: false, update: false, execute: false };
      return { ...p, [mod]: { ...cur, [key]: !cur[key] } };
    });
  }

  async function handleCreate() {
    if (!orgId) return;
    if (!name.trim()) { toast.error("Give the agent a name"); setStep(0); return; }
    setSaving(true);
    try {
      const spec: AgentSpec = {
        name, description, instructions: systemPrompt, requires_approval: requiresApproval, activate,
        modules: Object.entries(modulePerms).map(([module, v]) => ({ module, ...v })),
        tools: Object.entries(selectedTools).filter(([, v]) => v).map(([n]) => n),
        triggers,
      };
      const agent = await createAgentOnServer({ data: { orgId, spec: spec as unknown as Record<string, unknown> } });
      toast.success(activate ? "Agent created and active" : "Agent saved as a draft");
      navigate({ to: "/app/agents/$agentId", params: { agentId: agent.id } });
    } catch (err) {
      toast.error(friendlyError(err, "Could not create the agent"));
    } finally { setSaving(false); }
  }

  const setTrigger = (i: number, t: AgentTrigger) => setTriggers((arr) => arr.map((x, idx) => (idx === i ? t : x)));

  return (
    <AgentsShell title="New agent" breadcrumb="AI Agents / Create">
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {SECTIONS.map((s, i) => (
          <Button variant="bare" size="bare"
            key={s}
            onClick={() => setStep(i)}
            className={`border px-3 py-1.5 font-mono text-xs uppercase tracking-widest ${i === step ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground"}`}
          >
            {String(i + 1).padStart(2, "0")} · {s}
          </Button>
        ))}
      </div>

      <div className="border border-border bg-card shadow-sm p-6">
        {step === 0 && (
          <div className="space-y-4">
            <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Invoice Collection Agent" /></Field>
            <Field label="Description"><textarea className="input min-h-[80px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this agent does, in one or two sentences." /></Field>
            <p className="text-xs text-muted-foreground">Every agent uses the model chosen for "AI agents" in <a className="text-primary underline-offset-4 hover:underline" href="/app/settings/ai">Settings › AI</a> (built-in AI unless you added your own provider). Each run uses one AI action.</p>
          </div>
        )}
        {step === 1 && (
          <Field label="System prompt"><textarea className="input min-h-[260px]" value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} /></Field>
        )}
        {step === 2 && (
          <div>
            <p className="mb-3 text-sm text-muted-foreground">Tick only what this agent needs. It can only call tools whose module is ticked here. Use the All column to tick a whole row.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2.5 text-left font-medium">Module</th>
                    <th className="w-16 border-r border-border px-2 py-2.5 text-center font-medium">All</th>
                    {PERM_KEYS.map((a) => <th key={a} className="w-20 px-2 py-2.5 text-center font-medium">{a}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {/* Column-wide ticks get their own shaded row, so no box sits on the header line. */}
                  <tr className="border-b border-border bg-muted/40">
                    <td className="px-2 py-2.5 text-xs text-muted-foreground">Every module</td>
                    <td className="border-r border-border px-2 py-2.5 text-center"><PermBox label="All modules, all actions" state={isOn(MODULE_KEYS, PERM_KEYS)} onChange={(v) => setPerms(MODULE_KEYS, PERM_KEYS, v)} /></td>
                    {PERM_KEYS.map((a) => (
                      <td key={a} className="px-2 py-2.5 text-center"><PermBox label={`${a} for every module`} state={isOn(MODULE_KEYS, [a])} onChange={(v) => setPerms(MODULE_KEYS, [a], v)} /></td>
                    ))}
                  </tr>
                  {MODULE_KEYS.map((mod) => (
                    <tr key={mod} className="border-b border-border last:border-b-0">
                      <td className="px-2 py-2.5">{MODULE_LABELS[mod] ?? mod}</td>
                      <td className="border-r border-border px-2 py-2.5 text-center"><PermBox label={`Every action for ${MODULE_LABELS[mod] ?? mod}`} state={isOn([mod], PERM_KEYS)} onChange={(v) => setPerms([mod], PERM_KEYS, v)} /></td>
                      {PERM_KEYS.map((a) => (
                        <td key={a} className="px-2 py-2.5 text-center"><input type="checkbox" aria-label={`${a} for ${MODULE_LABELS[mod] ?? mod}`} className="align-middle" checked={!!modulePerms[mod]?.[a]} onChange={() => toggleModule(mod, a)} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Pick which tools this agent can call. Tools marked “requires approval” will create a human-review item every time they run.</p>
            <div className="grid gap-2 md:grid-cols-2">
              {USABLE_TOOLS.map((t) => (
                <label key={t.name} className="flex items-start gap-2 border border-border p-2 text-sm">
                  <input type="checkbox" checked={!!selectedTools[t.name]} onChange={() => setSelectedTools((s) => ({ ...s, [t.name]: !s[t.name] }))} />
                  <div>
                    <div className="font-medium">{t.label}</div>
                    <div className="text-xs text-muted-foreground">{t.description}</div>
                    <div className="mt-1 flex gap-1 text-xs">
                      {t.requiresApproval && <span className="border border-warning/40 px-1 text-warning">approval</span>}
                      {t.externalAccess && <span className="border border-info/40 px-1 text-info">external</span>}
                      {!t.readOnly && <span className="border border-destructive/40 px-1 text-destructive">write</span>}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}
        {step === 4 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">When the agent runs. It can always be run by hand from its Chat tab. Scheduled and event runs happen only while the agent is active; anything they want to change still waits in Inbox › Approvals.</p>
            {triggers.map((t, i) => t.type === "manual" ? (
              <div key={i} className="border border-border bg-muted/30 px-3 py-2 text-sm">When you run it (always on)</div>
            ) : (
              <div key={i} className="grid gap-2 border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select className="input w-auto" aria-label="Kind of trigger" value={t.type}
                    onChange={(e) => setTrigger(i, e.target.value === "scheduled"
                      ? { type: "scheduled", config: { every: "day", at: "09:00", tz: BROWSER_TZ, prompt: t.config.prompt } }
                      : { type: "event_based", config: { event: Object.keys(AGENT_EVENTS)[0], prompt: t.config.prompt } })}>
                    <option value="scheduled">On a schedule</option>
                    <option value="event_based">When something happens</option>
                  </select>
                  {t.type === "scheduled" ? (
                    <>
                      <select className="input w-auto" aria-label="How often" value={t.config.every} onChange={(e) => setTrigger(i, { ...t, config: { ...t.config, every: e.target.value as ScheduleConfig["every"] } })}>
                        <option value="hour">Every hour</option><option value="day">Every day</option><option value="weekday">Every weekday</option><option value="week">Every week</option>
                      </select>
                      {t.config.every === "week" && (
                        <select className="input w-auto" aria-label="Day" value={t.config.day ?? 1} onChange={(e) => setTrigger(i, { ...t, config: { ...t.config, day: Number(e.target.value) } })}>
                          {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, n) => <option key={d} value={n}>{d}</option>)}
                        </select>
                      )}
                      {t.config.every !== "hour" && (
                        <input type="time" className="input w-auto" aria-label="Time" value={t.config.at ?? "09:00"} onChange={(e) => setTrigger(i, { ...t, config: { ...t.config, at: e.target.value } })} />
                      )}
                      <span className="text-xs text-muted-foreground">{t.config.tz ?? BROWSER_TZ} time</span>
                    </>
                  ) : (
                    <select className="input w-auto" aria-label="Event" value={t.config.event} onChange={(e) => setTrigger(i, { ...t, config: { ...t.config, event: e.target.value } })}>
                      {Object.entries(AGENT_EVENTS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                  )}
                  <Button variant="ghost" size="sm" type="button" className="ml-auto" onClick={() => setTriggers((arr) => arr.filter((_, idx) => idx !== i))}>Remove</Button>
                </div>
                <input className="input" aria-label="What to do on this run" placeholder="What should it do on this run? e.g. Draft a reminder for each overdue invoice."
                  value={t.config.prompt ?? ""} onChange={(e) => setTrigger(i, { ...t, config: { ...t.config, prompt: e.target.value } } as AgentTrigger)} />
              </div>
            ))}
            <Button variant="kit" size="kit" type="button" onClick={() => setTriggers((arr) => [...arr, { type: "scheduled", config: { every: "day", at: "09:00", tz: BROWSER_TZ } }])} className="px-3 py-1.5 hover:bg-accent">+ Add a schedule or event</Button>
          </div>
        )}
        {step === 5 && (
          <div className="space-y-3">
            <label className="flex items-start gap-2"><input type="checkbox" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} /> <span className="text-sm">Require human approval for all sensitive actions (recommended)</span></label>
            <div className="border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
              Sensitive actions <strong>always</strong> require approval regardless of this toggle: sending emails, creating/sending invoices, recording payments, changing accounting entries, creating purchase orders, adjusting inventory, changing HR records, deleting records, calling external write APIs, sending customer-visible messages.
            </div>
          </div>
        )}
        {step === 6 && (
          <div className="space-y-3 text-sm">
            <Row k="Name"        v={name || "—"} />
            <Row k="Model"       v="The AI agents model in Settings › AI" />
            <Row k="Modules"     v={Object.entries(modulePerms).filter(([, v]) => v.read || v.create || v.update || v.execute).map(([m]) => MODULE_LABELS[m] ?? m).join(", ") || "—"} />
            <Row k="Tools"       v={Object.entries(selectedTools).filter(([, v]) => v).map(([n]) => USABLE_TOOLS.find((t) => t.name === n)?.label ?? n).join(", ") || "—"} />
            <Row k="Runs"        v={triggers.map(describeTrigger).join("; ")} />
            <Row k="Approvals"   v={requiresApproval ? "Required" : "Optional"} />
            <label className="flex items-start gap-2 pt-3"><input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} /> <span>Activate immediately (otherwise saved as draft)</span></label>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Button variant="kit" size="kit" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="px-4 py-2">Back</Button>
        {step < SECTIONS.length - 1 ? (
          <Button variant="kitSolid" size="kit" onClick={() => setStep((s) => s + 1)} className="px-4 py-2">Next</Button>
        ) : (
          <Button variant="kitSolid" size="kit" disabled={saving || !name.trim()} onClick={handleCreate} className="px-4 py-2">
            {saving ? "Saving…" : activate ? "Create & activate" : "Save as draft"}
          </Button>
        )}
      </div>

      <style>{`.input{width:100%;border:1px solid hsl(var(--border));background:hsl(var(--background));padding:.5rem .75rem;font-size:.875rem;}.input:focus{outline:none;border-color:hsl(var(--foreground));}`}</style>
    </AgentsShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex items-start justify-between gap-4 border-b border-border py-1.5"><span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{k}</span><span className="text-right">{v}</span></div>;
}

const PERM_KEYS = ["read", "create", "update", "execute"] as const;
type PermKey = (typeof PERM_KEYS)[number];

/** A checkbox that shows a dash when only some of the boxes it controls are ticked. */
function PermBox({ state, onChange, label }: { state: { all: boolean; some: boolean }; onChange: (on: boolean) => void; label: string }) {
  return (
    <input
      type="checkbox"
      className="align-middle"
      aria-label={label}
      checked={state.all}
      ref={(el) => { if (el) el.indeterminate = state.some && !state.all; }}
      onChange={() => onChange(!state.all)}
    />
  );
}
