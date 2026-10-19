import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { PlatformShell } from "@/components/platform/platform-shell";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney, type Plan, type PlanLimits } from "@/lib/billing/use-subscription";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app/platform/plans")({
  head: () => ({ meta: [{ title: "Plans — Platform" }] }),
  component: PlatformPlans,
});

const ALL_MODULES = ["crm", "sales", "invoices", "inventory", "purchasing", "accounting", "projects", "hr", "reports", "settings"];
const KIND_LABEL: Record<Plan["plan_kind"], string> = {
  tier: "Pricing-page plan (limits per month)",
  free_package: "Free first year",
  package: "Package (users × months)",
  storage: "Storage plan (unlimited users)",
  legacy: "Old per-user plan",
};

const db = supabase as any;

function useAllPlans() {
  return useQuery({
    queryKey: ["platform-plans"],
    queryFn: async () => {
      const { data, error } = await db.from("subscription_plans").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });
}

function PlatformPlans() {
  const plans = useAllPlans();
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["platform-plans"] });
    qc.invalidateQueries({ queryKey: ["subscription-plans"] });
  };

  async function addPlan(kind: "package" | "storage") {
    const code = `${kind}_${Date.now().toString(36)}`;
    const { error } = await db.from("subscription_plans").insert({
      code, plan_kind: kind, name: kind === "package" ? "New package" : "New storage plan",
      user_limit: kind === "package" ? 10 : null, term_months: 12, price_total: null,
      storage_limit_gb: kind === "storage" ? 50 : null, bandwidth_limit_gb: kind === "storage" ? 500 : null,
      modules: ALL_MODULES, features: ["Every module"], is_active: false, is_public: true, sort_order: 100,
    });
    if (error) return toast.error(error.message);
    toast.success("Plan added as inactive. Set its price, then activate it.");
    refresh();
  }

  const tiers = plans.data?.filter((p) => p.plan_kind === "tier") ?? [];
  const current = plans.data?.filter((p) => p.plan_kind !== "legacy" && p.plan_kind !== "tier") ?? [];
  const legacy = plans.data?.filter((p) => p.plan_kind === "legacy") ?? [];

  return (
    <PlatformShell title="Subscription plans" breadcrumb="platform · plans">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Catalog</div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every plan includes every module; plans differ by users, time and storage. A plan is on sale when it is
            <strong> active</strong>, <strong>public</strong> and has a price. New companies start on the free first year.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="kit" size="kit" onClick={() => addPlan("package")} className="gap-1 px-3 py-2 hover:bg-muted">
            <Plus className="size-3" /> Package
          </Button>
          <Button variant="kit" size="kit" onClick={() => addPlan("storage")} className="gap-1 px-3 py-2 hover:bg-muted">
            <Plus className="size-3" /> Storage plan
          </Button>
        </div>
      </div>

      {tiers.length > 0 && (
        <section className="mb-10">
          <div className="mb-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">Pricing-page plans</div>
          <p className="mb-3 max-w-3xl text-sm text-muted-foreground">
            The plans on /pricing. New workspaces start on Startup. Until online payment is switched on, put a workspace on a
            plan from Organizations. An empty limit means no limit; a custom offering can override any of them for one workspace.
          </p>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {tiers.map((p) => <TierEditor key={p.id} plan={p} onSaved={refresh} />)}
          </div>
        </section>
      )}

      <div className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">Prepaid packages</div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {current.map((p) => <PlanEditor key={p.id} plan={p} onSaved={refresh} />)}
      </div>

      {legacy.length > 0 && (
        <section className="mt-10">
          <div className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">Old per-user plans (not on sale)</div>
          <div className="divide-y divide-border border border-border bg-background text-sm">
            {legacy.map((p) => (
              <div key={p.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span>{p.name} <span className="font-mono text-xs text-muted-foreground">{p.code}</span></span>
                <span className="text-muted-foreground">
                  {p.price_monthly > 0 ? `${fmtMoney(p.price_monthly, p.currency)} / user / month` : "free"} · kept for existing subscribers until renewal
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </PlatformShell>
  );
}

type Draft = {
  name: string; description: string; user_limit: string; term_months: string; price_total: string; currency: string;
  storage_limit_gb: string; bandwidth_limit_gb: string; features: string; is_active: boolean; is_public: boolean;
};

const toDraft = (p: Plan): Draft => ({
  name: p.name, description: p.description ?? "",
  user_limit: p.user_limit == null ? "" : String(p.user_limit),
  term_months: p.term_months == null ? "" : String(p.term_months),
  price_total: p.price_total == null ? "" : String(p.price_total),
  currency: p.currency,
  storage_limit_gb: p.storage_limit_gb == null ? "" : String(p.storage_limit_gb),
  bandwidth_limit_gb: p.bandwidth_limit_gb == null ? "" : String(p.bandwidth_limit_gb),
  features: p.features.join("\n"),
  is_active: p.is_active, is_public: p.is_public,
});

const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

function PlanEditor({ plan, onSaved }: { plan: Plan; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(toDraft(plan));
  const [saving, setSaving] = useState(false);
  useEffect(() => setD(toDraft(plan)), [plan]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const free = plan.plan_kind === "free_package";

  async function save() {
    const price = free ? 0 : numOrNull(d.price_total);
    const term = numOrNull(d.term_months);
    if (!d.name.trim()) return toast.error("Name is required.");
    if (!term || term < 1 || term > 120) return toast.error("Months must be between 1 and 120.");
    if (!free && d.is_active && !(price && price > 0)) return toast.error("Set a price above 0 before activating a paid plan.");
    if (!/^[A-Za-z]{3}$/.test(d.currency)) return toast.error("Currency must be a 3-letter code, e.g. USD.");
    setSaving(true);
    const { error } = await db.from("subscription_plans").update({
      name: d.name.trim(), description: d.description.trim() || null,
      user_limit: numOrNull(d.user_limit), term_months: term, price_total: price,
      currency: d.currency.toUpperCase(),
      storage_limit_gb: numOrNull(d.storage_limit_gb), bandwidth_limit_gb: numOrNull(d.bandwidth_limit_gb),
      features: d.features.split("\n").map((f) => f.trim()).filter(Boolean),
      is_active: d.is_active, is_public: d.is_public,
    }).eq("id", plan.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Plan saved");
    onSaved();
  }

  const onSale = d.is_active && d.is_public && (free || Number(d.price_total) > 0);
  return (
    <div className="border border-border bg-card shadow-sm p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{KIND_LABEL[plan.plan_kind]} · {plan.code}</div>
        <span className={`px-2 py-0.5 font-mono text-xs uppercase tracking-wider ${onSale ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>
          {free ? (d.is_active ? "given to new companies" : "inactive") : onSale ? "on sale" : "not on sale"}
        </span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Name"><input className="pinput" value={d.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label={free ? "Price" : "Price for the whole term"}>
          <div className="flex gap-2">
            <input className="pinput" type="number" min={0} step="0.01" disabled={free} value={free ? "0" : d.price_total} onChange={(e) => set("price_total", e.target.value)} placeholder="Not set" />
            <input className="pinput w-20" value={d.currency} onChange={(e) => set("currency", e.target.value)} aria-label="Currency" />
          </div>
        </Field>
        <Field label="Months"><input className="pinput" type="number" min={1} max={120} value={d.term_months} onChange={(e) => set("term_months", e.target.value)} /></Field>
        <Field label="Users (empty = unlimited)"><input className="pinput" type="number" min={1} value={d.user_limit} onChange={(e) => set("user_limit", e.target.value)} placeholder="Unlimited" /></Field>
        <Field label="Storage GB (empty = unlimited)"><input className="pinput" type="number" min={0} value={d.storage_limit_gb} onChange={(e) => set("storage_limit_gb", e.target.value)} placeholder="Unlimited" /></Field>
        <Field label="Bandwidth GB / month"><input className="pinput" type="number" min={0} value={d.bandwidth_limit_gb} onChange={(e) => set("bandwidth_limit_gb", e.target.value)} placeholder="Not limited" /></Field>
        <Field label="Description" wide><input className="pinput" value={d.description} onChange={(e) => set("description", e.target.value)} /></Field>
        <Field label="Features (one per line)" wide>
          <textarea className="pinput min-h-[80px]" value={d.features} onChange={(e) => set("features", e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={d.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Active</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={d.is_public} onChange={(e) => set("is_public", e.target.checked)} /> Shown to customers</label>
        <Button variant="kitSolid" size="kit" onClick={save} disabled={saving} className="ml-auto px-4 py-2">
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      <style>{`.pinput{width:100%;border:1px solid hsl(var(--border));background:hsl(var(--background));padding:.45rem .6rem;font-size:.875rem}.pinput:focus{outline:none;border-color:hsl(var(--foreground))}.pinput:disabled{opacity:.6}`}</style>
    </div>
  );
}

const LIMIT_FIELDS: [keyof PlanLimits, string][] = [
  ["contacts", "Contacts"], ["open_pipeline", "Open leads + deals"], ["active_projects", "Active projects"],
  ["employees", "Employees"], ["invoices_month", "Invoices a month"], ["automations", "Automations"],
  ["ai_actions_month", "AI actions a month"], ["storage_gb", "Storage GB"],
];

/** A pricing-page plan: monthly price (a year is ten months) and its limits. */
function TierEditor({ plan, onSaved }: { plan: Plan; onSaved: () => void }) {
  const [price, setPrice] = useState(String(plan.price_monthly ?? 0));
  const [limits, setLimits] = useState<Record<string, string>>(() =>
    Object.fromEntries(LIMIT_FIELDS.map(([k]) => [k, plan.limits?.[k] == null ? "" : String(plan.limits[k])])));
  const [features, setFeatures] = useState(plan.features.join("\n"));
  const [saving, setSaving] = useState(false);

  async function save() {
    const monthly = Number(price);
    if (!Number.isFinite(monthly) || monthly < 0) return toast.error("Price must be 0 or more.");
    const next: PlanLimits = { ...(plan.limits?.sponsor_offers ? { sponsor_offers: true } : {}) };
    for (const [k] of LIMIT_FIELDS) {
      const v = limits[k].trim();
      if (v === "") continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return toast.error("Limits must be 0 or more, or empty for no limit.");
      (next as Record<string, number>)[k] = n;
    }
    setSaving(true);
    const { error } = await db.from("subscription_plans").update({
      price_monthly: monthly, price_yearly: monthly * 10, price_total: monthly, limits: next,
      storage_limit_gb: next.storage_gb ?? null,
      features: features.split("\n").map((f) => f.trim()).filter(Boolean),
    }).eq("id", plan.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${plan.name} saved`);
    onSaved();
  }

  return (
    <div className="border border-border bg-card shadow-sm p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-heading text-lg">{plan.name}</div>
        <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{plan.code}{plan.is_public ? "" : " · not listed"}</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label={`Price a month (${plan.currency}); a year = 10 months`}>
          <input className="pinput" type="number" min={0} step="1" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <div className="self-end pb-2 text-sm text-muted-foreground">{fmtMoney(Number(price || 0) * 10, plan.currency)} a year</div>
        {LIMIT_FIELDS.map(([k, label]) => (
          <Field key={k} label={label}>
            <input className="pinput" type="number" min={0} value={limits[k]} onChange={(e) => setLimits((x) => ({ ...x, [k]: e.target.value }))} placeholder="No limit" />
          </Field>
        ))}
        <Field label="Features shown on Billing (one per line)" wide>
          <textarea className="pinput min-h-[70px]" value={features} onChange={(e) => setFeatures(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
