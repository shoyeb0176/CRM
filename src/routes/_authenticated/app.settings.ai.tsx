import { useAiUsage as usePlanAiUsage } from "@/lib/billing/use-subscription";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AiRulesPanel } from "@/components/ai/ai-rules-panel";
import { SettingsShell, SettingsField, SettingsInput, SettingsSelect } from "@/components/settings/settings-shell";
import { useAdminContext } from "@/lib/settings/use-admin";
import { supabase } from "@/integrations/supabase/client";
import {
  AI_PURPOSES, PROVIDERS, PROVIDER_PRESETS, BUILTIN_MODEL_CHOICES,
  useAiProviders, useAiRoutes, useAiPolicy, useAiUsage,
  type ProviderKey,
} from "@/lib/ai/use-ai-config";
import { saveAiProviderKey, removeAiProviderKey, testAiConnection } from "@/lib/ai/ai-config.functions";
import { MODEL_SUGGESTIONS, PROVIDER_DEFAULT_MODEL } from "@/lib/ai/models";
import { Bot, KeyRound, Plug, Trash2, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";

import { friendlyError } from "@/lib/friendly-error";
import { SectionTitle } from "@/components/ui/section-title";
export const Route = createFileRoute("/_authenticated/app/settings/ai")({
  component: AiSettingsPage,
  head: () => ({
    meta: [
      { title: "AI settings · Inuberry ERP" },
      { name: "description", content: "Choose which AI models power your Inuberry workspace, connect your own provider keys, and track AI usage and cost." },
      { property: "og:title", content: "AI settings · Inuberry ERP" },
      { property: "og:description", content: "Model-agnostic AI configuration for your Inuberry workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Card({ title, icon: Icon, children }: { title: string; icon: typeof Bot; children: React.ReactNode }) {
  return (
    <section className="border border-border bg-background">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon className="size-4 text-primary" />
        <SectionTitle>{title}</SectionTitle>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function AiSettingsPage() {
  const { orgId, isAdmin } = useAdminContext();
  const qc = useQueryClient();
  const providers = useAiProviders(orgId);
  const routes = useAiRoutes(orgId);
  const policy = useAiPolicy(orgId);
  const usage = useAiUsage(orgId);
  const actions = usePlanAiUsage(orgId);

  const saveKey = useServerFn(saveAiProviderKey);
  const removeKey = useServerFn(removeAiProviderKey);
  const testConn = useServerFn(testAiConnection);

  const [newProvider, setNewProvider] = useState<string>("openai");
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ai-providers", orgId] });
    qc.invalidateQueries({ queryKey: ["ai-routes", orgId] });
    qc.invalidateQueries({ queryKey: ["ai-policy", orgId] });
  };

  if (!orgId) {
    return <SettingsShell title="AI" breadcrumb="settings / ai"><div className="font-mono text-xs text-muted-foreground">Loading…</div></SettingsShell>;
  }

  async function addProvider() {
    const preset = PROVIDER_PRESETS.find((p) => p.key === newProvider);
    const providerKey = (preset?.provider ?? newProvider) as ProviderKey;
    const meta = PROVIDERS.find((p) => p.key === providerKey)!;
    const baseUrl = newUrl.trim() || preset?.baseUrl || "";
    if (meta.needsUrl && !baseUrl) return toast.error("This provider needs a base URL.");
    setBusy(true);
    const { error } = await supabase.from("ai_provider_configs").insert({
      org_id: orgId!,
      provider: providerKey,
      label: newLabel.trim() || preset?.label || meta.label,
      base_url: baseUrl || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setNewLabel(""); setNewUrl("");
    toast.success("Provider added");
    invalidate();
  }

  async function deleteProvider(id: string) {
    if (!window.confirm("Remove this provider? Anything routed to it goes back to the built-in AI.")) return;
    const { error } = await supabase.from("ai_provider_configs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Provider removed");
    invalidate();
  }

  async function storeKey(id: string) {
    const value = (keyDrafts[id] ?? "").trim();
    if (value.length < 8) return toast.error("Enter the full key.");
    setBusy(true);
    try {
      await saveKey({ data: { orgId: orgId!, providerConfigId: id, apiKey: value } });
      setKeyDrafts((d) => ({ ...d, [id]: "" }));
      toast.success("Key saved securely");
      invalidate();
    } catch (e) {
      toast.error(friendlyError(e, "Could not save the key"));
    } finally { setBusy(false); }
  }

  async function clearKey(id: string) {
    try {
      await removeKey({ data: { orgId: orgId!, providerConfigId: id } });
      toast.success("Key removed");
      invalidate();
    } catch (e) {
      toast.error(friendlyError(e, "Could not remove the key"));
    }
  }

  async function saveRoute(purpose: string, patch: { provider_config_id?: string | null; model?: string }) {
    const existing = routes.data?.find((r) => r.purpose === purpose);
    // A new provider starts on its own default model: the previous provider's model name
    // (e.g. a built-in "google/…" one) would be rejected by OpenAI, Anthropic or Google.
    let model = patch.model;
    if (model === undefined && patch.provider_config_id !== undefined && patch.provider_config_id !== existing?.provider_config_id) {
      const kind = providerList.find((c) => c.id === patch.provider_config_id)?.provider as keyof typeof PROVIDER_DEFAULT_MODEL | undefined;
      model = kind && kind in PROVIDER_DEFAULT_MODEL ? PROVIDER_DEFAULT_MODEL[kind] : BUILTIN_MODEL_CHOICES[0];
    }
    const row = {
      org_id: orgId!,
      purpose,
      provider_config_id: patch.provider_config_id !== undefined ? patch.provider_config_id : existing?.provider_config_id ?? null,
      model: model ?? existing?.model ?? BUILTIN_MODEL_CHOICES[0],
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("ai_model_routes").upsert(row, { onConflict: "org_id,purpose" });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["ai-routes", orgId] });
  }

  async function savePolicy(patch: Record<string, unknown>) {
    const { error } = await supabase.from("ai_org_policies")
      .upsert({ org_id: orgId!, ...patch, updated_at: new Date().toISOString() }, { onConflict: "org_id" });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["ai-policy", orgId] });
  }

  async function runTest(purpose: string) {
    setBusy(true);
    try {
      const res = await testConn({ data: { orgId: orgId!, purpose: purpose } });
      if (res.ok) toast.success(`Connected — ${res.provider} · ${res.model}`);
      else toast.error(res.error);
    } catch (e) {
      toast.error(friendlyError(e, "The test didn't run"));
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["ai-usage", orgId] });
    }
  }

  const providerList = providers.data ?? [];

  return (
    <SettingsShell title="AI" breadcrumb="settings / ai">
      {!isAdmin && (
        <div className="mb-4 border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          You can view AI settings. Only owners and admins can change them.
        </div>
      )}

      <div className="mb-4"><AiRulesPanel canEdit={isAdmin} /></div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Model routing" icon={Bot}>
          <p className="mb-4 text-xs text-muted-foreground">
            Choose which model handles each kind of work. Leave the provider on “Built-in AI” to use the managed models.
          </p>
          <div className="space-y-4">
            {/* Search embeddings: nothing uses them yet, so there's nothing to route. */}
            {AI_PURPOSES.filter((p) => p.key !== "embeddings").map((p) => {
              const r = routes.data?.find((x) => x.purpose === p.key);
              const selectedProvider = r?.provider_config_id
                ? providerList.find((c) => c.id === r.provider_config_id)
                : null;
              return (
                <div key={p.key} className="grid gap-2 border border-border p-3 xl:grid-cols-[1fr_1fr_auto] xl:items-end bg-card shadow-sm">
                  <SettingsField label={p.label}>
                    <SettingsSelect
                      disabled={!isAdmin}
                      value={r?.provider_config_id ?? ""}
                      onChange={(e) => saveRoute(p.key, { provider_config_id: e.target.value || null })}
                    >
                      <option value="">Built-in AI (managed)</option>
                      {providerList.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </SettingsSelect>
                  </SettingsField>
                  <SettingsField label="Model">
                    {selectedProvider ? (
                      <>
                        <SettingsInput
                          key={`${p.key}-${r?.model ?? ""}`}
                          disabled={!isAdmin}
                          defaultValue={r?.model ?? ""}
                          list={`models-${selectedProvider.provider}`}
                          placeholder={selectedProvider.provider === "azure_openai" ? "Your deployment name"
                            : PROVIDER_DEFAULT_MODEL[selectedProvider.provider as keyof typeof PROVIDER_DEFAULT_MODEL] || "Model name"}
                          onBlur={(e) => { if (e.target.value !== (r?.model ?? "")) saveRoute(p.key, { model: e.target.value }); }}
                        />
                        <datalist id={`models-${selectedProvider.provider}`}>
                          {(MODEL_SUGGESTIONS[selectedProvider.provider as keyof typeof MODEL_SUGGESTIONS] ?? []).map((m) => <option key={m} value={m} />)}
                        </datalist>
                      </>
                    ) : (
                      // Built-in AI picks its own model (and falls back to another if one is down);
                      // /ai-stats shows which model answered each call.
                      <div className="flex h-[38px] items-center border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                        Chosen by Inuberry
                      </div>
                    )}
                  </SettingsField>
                  <Button variant="kit" size="kit"
                    disabled={busy || !isAdmin}
                    title={isAdmin ? undefined : "Owners and admins can test the connection"}
                    onClick={() => runTest(p.key)}
                    className="h-[38px] px-3 hover:bg-muted"
                  >
                    Test
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Your AI providers" icon={Plug}>
            <div className="space-y-3">
              {providerList.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No provider connected. The workspace uses the built-in managed AI.
                </p>
              )}
              {providerList.map((c) => {
                const meta = PROVIDERS.find((p) => p.key === c.provider);
                return (
                  <div key={c.id} className="border border-border p-3 bg-card shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{c.label}</div>
                        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                          {meta?.label ?? c.provider}{c.base_url ? ` · ${c.base_url}` : ""}
                        </div>
                      </div>
                      {isAdmin && (
                        <Button variant="bare" size="bare" onClick={() => deleteProvider(c.id)} className="text-muted-foreground hover:text-destructive" aria-label="Remove provider">
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <div className="flex-1 min-w-[180px]">
                        <SettingsField label={c.has_key ? `Key saved ••••${c.key_last4 ?? ""}` : "API key"}>
                          <SettingsInput
                            type="password"
                            disabled={!isAdmin}
                            placeholder={c.has_key ? "Replace key" : "Paste key"}
                            value={keyDrafts[c.id] ?? ""}
                            onChange={(e) => setKeyDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                          />
                        </SettingsField>
                      </div>
                      <Button variant="kitSolid" size="kit"
                        disabled={!isAdmin || busy}
                        onClick={() => storeKey(c.id)}
                        className="h-[38px] bg-primary px-3 text-primary-foreground"
                      >
                        <KeyRound className="mr-1 inline size-3" /> Save
                      </Button>
                      {c.has_key && isAdmin && (
                        <Button variant="kit" size="kit" onClick={() => clearKey(c.id)} className="h-[38px] px-3 hover:bg-muted">
                          Clear
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {isAdmin && (
              <div className="mt-4 border-t border-border pt-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <SettingsField label="Add provider">
                    <SettingsSelect value={newProvider} onChange={(e) => setNewProvider(e.target.value)}>
                      {PROVIDERS.filter((p) => p.key !== "lovable").map((p) => (
                        <option key={p.key} value={p.key}>{p.label}</option>
                      ))}
                      {PROVIDER_PRESETS.map((p) => (
                        <option key={p.key} value={p.key}>{p.label}</option>
                      ))}
                    </SettingsSelect>
                  </SettingsField>
                  <SettingsField label="Name">
                    <SettingsInput value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Our OpenAI account" />
                  </SettingsField>
                </div>
                {newProvider === "openrouter" && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Paste your OpenRouter key after adding, then pick it under Model routing and type a model such as
                    <span className="font-mono"> openai/gpt-6-luna</span> or <span className="font-mono">anthropic/claude-haiku-5-5</span> (free keys: a model ending in <span className="font-mono">:free</span>).
                  </p>
                )}
                {PROVIDERS.find((p) => p.key === newProvider)?.needsUrl && (
                  <div className="mt-2">
                    <SettingsField label="Base URL" hint="For Azure, the full deployment endpoint. For local models, e.g. http://localhost:11434/v1">
                      <SettingsInput value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://…" />
                    </SettingsField>
                  </div>
                )}
                <Button variant="kitSolid" size="kit"
                  disabled={busy}
                  onClick={addProvider}
                  className="mt-3 px-4 py-2"
                >
                  Add provider
                </Button>
              </div>
            )}
          </Card>

          <Card title="Data policy" icon={KeyRound}>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                disabled={!isAdmin}
                className="mt-1"
                checked={policy.data?.allow_builtin ?? true}
                onChange={(e) => savePolicy({ allow_builtin: e.target.checked })}
              />
              <span>
                Allow the built-in managed AI.
                <span className="block text-xs text-muted-foreground">
                  Turn this off to require that all AI work runs through your own provider.
                </span>
              </span>
            </label>
            <div className="mt-4 max-w-xs">
              <SettingsField label="Monthly AI budget (USD)" hint="Indicative — used for reporting.">
                <SettingsInput
                  key={`budget-${policy.data?.monthly_budget_usd ?? ""}`}
                  type="number"
                  disabled={!isAdmin}
                  defaultValue={policy.data?.monthly_budget_usd ?? ""}
                  onBlur={(e) => savePolicy({ monthly_budget_usd: e.target.value ? Number(e.target.value) : null })}
                />
              </SettingsField>
            </div>
          </Card>

          {actions.data && (
            <Card title="AI actions this month" icon={Activity}>
              <p className="text-sm">
                <span className="font-heading text-lg">{actions.data.used.toLocaleString()}</span>
                {actions.data.limit != null ? <> of {actions.data.limit.toLocaleString()} used</> : " used (no limit on your plan)"}
                <span className="text-muted-foreground"> · resets {new Date(actions.data.resets_on).toLocaleDateString()}</span>
              </p>
              {actions.data.limit != null && (
                <div className="mt-2 h-1.5 w-full bg-border" role="progressbar" aria-label="AI actions used"
                  aria-valuenow={Math.min(100, Math.round((actions.data.used / Math.max(1, actions.data.limit)) * 100))} aria-valuemin={0} aria-valuemax={100}>
                  <div className={`h-full ${actions.data.used >= actions.data.limit * 0.9 ? "bg-destructive" : "bg-primary"}`}
                    style={{ width: `${Math.min(100, (actions.data.used / Math.max(1, actions.data.limit)) * 100)}%` }} />
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                One action is one message to the assistant or an agent, one AI summary or one knowledge answer.
                {actions.data.own_key ? ` ${actions.data.own_key} more ran on your own AI key and don't count.` : " Actions on your own AI key (above) don't count."}{" "}
                <Link to="/app/settings/billing" className="text-primary hover:underline">See plans</Link>
              </p>
            </Card>
          )}
          <Card title="Usage — last 30 days" icon={Activity}>
            {!isAdmin ? (
              <p className="text-xs text-muted-foreground">Usage is visible to owners and admins.</p>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-px bg-border">
                  {[
                    ["Calls", usage.data?.calls ?? 0],
                    ["Failed", usage.data?.failed ?? 0],
                    ["Tokens", (usage.data?.tokens ?? 0).toLocaleString()],
                    ["Cost", `$${(usage.data?.cost ?? 0).toFixed(2)}`],
                  ].map(([label, value]) => (
                    <div key={label as string} className="bg-background p-3">
                      <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
                      <div className="font-heading text-lg">{value}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 max-h-56 overflow-y-auto">
                  {(usage.data?.rows ?? []).map((r, i) => (
                    <div key={i} className="border-b border-border py-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{r.purpose} · {r.model}</span>
                        <span className={`shrink-0 font-mono text-xs ${r.status === "completed" ? "text-muted-foreground" : "text-destructive"}`}>
                          {r.status === "completed" ? `${r.total_tokens ?? 0} tok` : "failed"}
                        </span>
                      </div>
                      {r.status !== "completed" && r.error && (
                        <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground" title={r.error}>{r.error}</div>
                      )}
                    </div>
                  ))}
                  {(usage.data?.rows.length ?? 0) === 0 && (
                    <p className="pt-2 text-xs text-muted-foreground">No AI activity yet.</p>
                  )}
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </SettingsShell>
  );
}
