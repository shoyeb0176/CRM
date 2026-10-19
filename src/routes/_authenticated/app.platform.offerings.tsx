import { createFileRoute } from "@tanstack/react-router";
import { PlatformShell } from "@/components/platform/platform-shell";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createCustomOffering, detachCustomOffering } from "@/lib/platform/platform.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/platform/offerings")({
  head: () => ({ meta: [{ title: "Custom offerings — Platform" }] }),
  component: OfferingsPage,
});

const MODULES = ["crm", "invoicing", "products", "inventory", "hr", "accounting", "projects", "purchasing", "reports", "agents"];

function OfferingsPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["custom-offerings"],
    queryFn: async () =>
      (await supabase
        .from("custom_offerings")
        .select("*, org:org_id(id, name, slug)")
        .order("created_at", { ascending: false })
      ).data ?? [],
  });
  const orgs = useQuery({
    queryKey: ["orgs-min"],
    queryFn: async () => (await supabase.from("organizations").select("id, name, slug").order("name")).data ?? [],
  });

  const createM = useMutation({
    mutationFn: useServerFn(createCustomOffering),
    onSuccess: () => { toast.success("Custom offering created"); qc.invalidateQueries({ queryKey: ["custom-offerings"] }); },
    onError: (e) => toast.error(String(e)),
  });
  const detachM = useMutation({
    mutationFn: useServerFn(detachCustomOffering),
    onSuccess: () => { toast.success("Detached"); qc.invalidateQueries({ queryKey: ["custom-offerings"] }); },
    onError: (e) => toast.error(String(e)),
  });

  const [orgId, setOrgId] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [interval, setInterval] = useState<"monthly" | "yearly" | "none">("monthly");
  const [userLimit, setUserLimit] = useState("");
  const [aiLimit, setAiLimit] = useState("");
  const [mods, setMods] = useState<string[]>([]);
  const [trialDays, setTrialDays] = useState("");

  function submit() {
    if (!orgId || !name) { toast.error("Org and name required"); return; }
    createM.mutate({
      data: {
        orgId,
        name,
        overridePrice: price ? Number(price) : null,
        overrideInterval: interval,
        modules: mods.length ? mods : null,
        userLimit: userLimit ? Number(userLimit) : null,
        aiAgentLimit: aiLimit ? Number(aiLimit) : null,
        trialEndsAt: trialDays ? new Date(Date.now() + Number(trialDays) * 86400000).toISOString() : null,
      },
    });
  }

  return (
    <PlatformShell title="Custom offerings" breadcrumb="platform · offerings">
      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        {/* Create form */}
        <div className="border border-border bg-card shadow-sm p-6">
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">New offering</div>
          <div className="mt-4 space-y-3">
            <Field label="Organization">
              <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="w-full border border-input bg-card shadow-xs px-2 py-1 text-sm">
                <option value="">Select…</option>
                {(orgs.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </Field>
            <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enterprise Q1 deal" className="w-full border border-input bg-card shadow-xs px-2 py-1 text-sm" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Price (USD)"><input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="299" type="number" min={0} className="w-full border border-input bg-card shadow-xs px-2 py-1 text-sm" /></Field>
              <Field label="Interval">
                <select value={interval} onChange={(e) => setInterval(e.target.value as any)} className="w-full border border-input bg-card shadow-xs px-2 py-1 text-sm">
                  <option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="none">One-off</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="User limit"><input value={userLimit} onChange={(e) => setUserLimit(e.target.value)} placeholder="unlimited" type="number" min={1} className="w-full border border-input bg-card shadow-xs px-2 py-1 text-sm" /></Field>
              <Field label="AI agent limit"><input value={aiLimit} onChange={(e) => setAiLimit(e.target.value)} placeholder="unlimited" type="number" min={0} className="w-full border border-input bg-card shadow-xs px-2 py-1 text-sm" /></Field>
            </div>
            <Field label="Trial extension (days)"><input value={trialDays} onChange={(e) => setTrialDays(e.target.value)} placeholder="30" type="number" min={0} className="w-full border border-input bg-card shadow-xs px-2 py-1 text-sm" /></Field>
            <Field label="Modules (override plan)">
              <div className="flex flex-wrap gap-1">
                {MODULES.map((m) => (
                  <label key={m} className={`cursor-pointer border px-2 py-0.5 font-mono text-xs uppercase tracking-wider ${mods.includes(m) ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                    <input type="checkbox" className="hidden" checked={mods.includes(m)} onChange={() => setMods((p) => p.includes(m) ? p.filter(x => x !== m) : [...p, m])} />
                    {m}
                  </label>
                ))}
              </div>
            </Field>
            <Button className="w-full" onClick={submit} disabled={createM.isPending}>
              Create &amp; attach
            </Button>
          </div>
        </div>

        {/* Existing list */}
        <div className="overflow-x-auto border border-border bg-card shadow-sm [&>*]:min-w-[580px]">
          <div className="grid grid-cols-[minmax(10rem,1fr)_120px_120px_100px] gap-4 border-b border-border bg-muted px-4 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            <div>Offering</div><div>Price</div><div>Modules</div><div></div>
          </div>
          {list.data?.length === 0 && <div className="p-6 font-mono text-xs text-muted-foreground">No custom offerings yet.</div>}
          {(list.data ?? []).map((o) => (
            <div key={o.id} className="grid grid-cols-[minmax(10rem,1fr)_120px_120px_100px] items-center gap-4 border-b border-border px-4 py-3 last:border-b-0">
              <div>
                <div className="text-sm font-semibold">{o.name}</div>
                <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{o.org?.name}</div>
              </div>
              <div className="font-mono text-xs">{o.override_price != null ? `$${o.override_price} / ${o.override_interval ?? "—"}` : "—"}</div>
              <div className="font-mono text-xs text-muted-foreground">{(o.modules ?? []).join(", ") || "plan default"}</div>
              <div>
                {o.is_active && (
                  <Button size="sm" variant="outline" onClick={() => detachM.mutate({ data: { orgId: o.org_id, offeringId: o.id } })}>Detach</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </PlatformShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}
