import { Loader2 } from "lucide-react";
import { ModulePicker, ALL_MODULES, toEnabledModules } from "@/components/settings/module-picker";
import { EligibilityFields } from "@/components/billing/eligibility-fields";
import { PROFESSIONS, REFERRAL_SOURCES, suggestedModules } from "@/lib/onboarding-presets";
import type { WorkspaceModule } from "@/components/app/nav";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
import { useMyMemberships } from "@/lib/use-memberships";
import { toast } from "sonner";
import { LedgerLines } from "@/components/marketing/marketing-shell";
import { Button } from "@/components/ui/button";

import { friendlyError } from "@/lib/friendly-error";
export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Create workspace — Inuberry" }] }),
  validateSearch: (s: Record<string, unknown>): { trial?: string; new?: string } => ({
    ...(typeof s['trial'] === "string" ? { trial: s['trial'] as string } : {}),
    ...(s['new'] !== undefined ? { new: String(s['new']) } : {}),
  }),
  component: OnboardingPage,
});

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function OnboardingPage() {
  const navigate = useNavigate();
  const memberships = useMyMemberships();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [seed, setSeed] = useState(true);
  const [modules, setModules] = useState<WorkspaceModule[]>(ALL_MODULES);
  const [bands, setBands] = useState({ employee: "", revenue: "" });
  const [heardFrom, setHeardFrom] = useState("");
  const [heardOther, setHeardOther] = useState("");
  const [profession, setProfession] = useState("");
  const [loading, setLoading] = useState(false);
  const { trial, new: isNew } = Route.useSearch();
  const qc = useQueryClient();
  const hasIntent = !!isNew || !!trial;

  // If user already has a workspace, route them straight in.
  useEffect(() => {
    if (!hasIntent && memberships.data && memberships.data.length > 0) {
      navigate({ to: "/app" });
    }
  }, [memberships.data, navigate, hasIntent]);

  async function seedDemoData(orgId: string, userId: string) {
    // CRM: companies + contacts + deal stages already seeded by trigger? No — call client
    const { data: stages } = await supabase
      .from("deal_stages")
      .insert([
        { org_id: orgId, name: "Discovery", position: 1, probability: 10, is_won: false, is_lost: false },
        { org_id: orgId, name: "Qualified", position: 2, probability: 30, is_won: false, is_lost: false },
        { org_id: orgId, name: "Proposal", position: 3, probability: 60, is_won: false, is_lost: false },
        { org_id: orgId, name: "Won", position: 4, probability: 100, is_won: true, is_lost: false },
      ])
      .select("id, name");

    const { data: companies } = await supabase
      .from("companies")
      .insert([
        { org_id: orgId, name: "Northwind Trading", industry: "Wholesale", website: "northwind.example.com", created_by: userId },
        { org_id: orgId, name: "Helix Studios", industry: "Creative agency", website: "helix.example.com", created_by: userId },
        { org_id: orgId, name: "Orbital Labs", industry: "SaaS", website: "orbital.example.com", created_by: userId },
      ])
      .select("id, name");

    if (companies?.length) {
      await supabase.from("contacts").insert([
        { org_id: orgId, company_id: companies[0].id, first_name: "Alex", last_name: "Rivera", email: "alex@northwind.example.com", job_title: "Procurement Lead", created_by: userId },
        { org_id: orgId, company_id: companies[1].id, first_name: "Sam", last_name: "Patel", email: "sam@helix.example.com", job_title: "Creative Director", created_by: userId },
        { org_id: orgId, company_id: companies[2].id, first_name: "Jordan", last_name: "Lee", email: "jordan@orbital.example.com", job_title: "Head of Ops", created_by: userId },
      ]);

      const proposalStage = stages?.find((s) => s.name === "Proposal");
      if (proposalStage) {
        await supabase.from("deals").insert([
          { org_id: orgId, company_id: companies[0].id, title: "Q3 supply contract", amount: 18500, currency: "USD", stage_id: proposalStage.id, created_by: userId, owner_id: userId, probability: 60 },
          { org_id: orgId, company_id: companies[1].id, title: "Brand refresh", amount: 9200, currency: "USD", stage_id: proposalStage.id, created_by: userId, owner_id: userId, probability: 60 },
        ]);
      }
    }

    // Products
    await supabase.from("products").insert([
      { org_id: orgId, name: "Consulting hour", sku: "SVC-001", sale_price: 150, product_type: "service", track_inventory: false, is_active: true, created_by: userId },
      { org_id: orgId, name: "Implementation package", sku: "SVC-002", sale_price: 4800, product_type: "service", track_inventory: false, is_active: true, created_by: userId },
      { org_id: orgId, name: "Annual support", sku: "SVC-003", sale_price: 2400, product_type: "service", track_inventory: false, is_active: true, created_by: userId },
    ]);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: u } = await getSessionUser();
      if (!u.user) throw new Error("Not signed in");
      const finalSlug = slug || slugify(name) || `org-${Date.now().toString(36)}`;

      const { data: org, error: orgErr } = await supabase
        .from("organizations")
        .insert({ name, slug: finalSlug, created_by: u.user.id, enabled_modules: toEnabledModules(modules) })
        .select()
        .single();
      if (orgErr) throw orgErr;
      // About you and the business (DB-29). Saved apart, so a database without it still creates the workspace.
      const referral = heardFrom === "other" ? `other: ${heardOther.trim().slice(0, 120)}` : heardFrom;
      if (referral || profession) {
        await supabase.from("profiles").update({ referral_source: referral || null, profession: profession || null } as never).eq("id", u.user.id);
      }
      if (profession) await supabase.from("organizations").update({ industry_preset: profession } as never).eq("id", org.id);
      if (bands.employee || bands.revenue) {
        // Saved apart from the workspace so a database without DB-27 still creates it.
        await supabase.from("organizations")
          .update({ employee_band: bands.employee || null, revenue_band: bands.revenue || null }).eq("id", org.id);
      }

      const { error: memErr } = await supabase
        .from("memberships")
        .insert({ org_id: org.id, user_id: u.user.id, role: "org_owner", status: "active" });
      if (memErr) throw memErr;

      await supabase
        .from("user_preferences")
        .upsert({ user_id: u.user.id, current_org_id: org.id });

      await supabase.from("audit_logs").insert({
        org_id: org.id,
        user_id: u.user.id,
        action: "org.created",
        entity_type: "organization",
        entity_id: org.id,
        diff: { name: org.name, slug: org.slug },
      });

      if (seed) {
        try {
          await seedDemoData(org.id, u.user.id);
        } catch (e) {
          console.warn("Seed failed:", e);
          toast.error(
            `Workspace created, but sample data could not be added: ${friendlyError(e, "unknown error")}`,
          );
        }
      }

      toast.success("Workspace created");
      await qc.cancelQueries();
      await qc.resetQueries();
      navigate({ to: "/app" });
    } catch (err) {
      toast.error(friendlyError(err, "Could not create workspace"));
    } finally {
      setLoading(false);
    }
  }

  if (!hasIntent && (memberships.isLoading || (memberships.data && memberships.data.length > 0))) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-background font-sans text-foreground">
      <LedgerLines />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-12">
        <form onSubmit={handleCreate} className="w-full max-w-2xl border border-border bg-card shadow-sm p-8">
          <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
            <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              SETUP / WORKSPACE_01
            </span>
            <span className="size-2 bg-primary" />
          </div>
          <h1 className="mb-2 font-display text-4xl uppercase">Name your workspace</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Your team shares one workspace: customers, invoices, stock and everything else live inside it.
          </p>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Company / team name
              </span>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSlug(slugify(e.target.value));
                }}
                required
                placeholder="Acme Industries"
                className="w-full border border-input bg-card shadow-xs px-3 py-2.5 text-sm focus:border-foreground focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">
                URL slug
              </span>
              <div className="flex items-center border border-input bg-card shadow-xs">
                <span className="px-3 font-mono text-xs text-muted-foreground">crm.inuberry.com/</span>
                <input
                  value={slug}
                  onChange={(e) => setSlug(slugify(e.target.value))}
                  required
                  pattern="[a-z0-9\-]+"
                  className="flex-1 bg-transparent px-2 py-2.5 font-mono text-sm focus:outline-none"
                />
              </div>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">How did you hear about us?</span>
                <select value={heardFrom} onChange={(e) => setHeardFrom(e.target.value)}
                  className="h-10 w-full border border-input bg-card px-3 text-sm shadow-xs focus:border-foreground focus:outline-none">
                  <option value="">Choose one (optional)</option>
                  {REFERRAL_SOURCES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
                {heardFrom === "other" && (
                  <input value={heardOther} onChange={(e) => setHeardOther(e.target.value)} maxLength={120} placeholder="Where?" aria-label="Where did you hear about us"
                    className="mt-2 w-full border border-input bg-card px-3 py-2 text-sm shadow-xs focus:border-foreground focus:outline-none" />
                )}
              </label>
              <label className="block">
                <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">What does your business do?</span>
                <select value={profession}
                  onChange={(e) => { setProfession(e.target.value); setModules(suggestedModules(e.target.value, ALL_MODULES)); }}
                  className="h-10 w-full border border-input bg-card px-3 text-sm shadow-xs focus:border-foreground focus:outline-none">
                  <option value="">Choose one (optional)</option>
                  {PROFESSIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </label>
            </div>
            <div>
              <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Which modules do you want to start with?
              </span>
              <ModulePicker value={modules} onChange={setModules} />
              <span className="mt-1 block text-xs text-muted-foreground">
                {profession ? "Ticked for what you do, so your sidebar starts simple. " : "Untick what you don't need, so your sidebar starts simple. "}
                You can turn any other module on later in Settings › Organization › Modules.
              </span>
            </div>
            <div>
              <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">
                About your business
              </span>
              <EligibilityFields employee={bands.employee} revenue={bands.revenue} onChange={setBands} />
              <span className="mt-1 block text-xs text-muted-foreground">The free Startup plan is for businesses with 15 or fewer people or under $100,000 a year in revenue.</span>
            </div>
            <label className="flex items-start gap-3 border border-dashed border-input bg-background/40 p-3">
              <input
                type="checkbox"
                checked={seed}
                onChange={(e) => setSeed(e.target.checked)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span className="text-xs leading-relaxed text-muted-foreground">
                <span className="block font-mono text-xs uppercase tracking-widest text-foreground">Load sample data</span>
                Adds a handful of demo companies, contacts, deals and services so you can explore right away. You can delete it any time.
              </span>
            </label>
            <p className="border border-dashed border-input bg-background/40 p-3 text-xs leading-relaxed text-muted-foreground">
              <span className="block font-mono text-xs uppercase tracking-widest text-foreground">Your first year is free</span>
              Up to 10 users and every module for 12 months. No card needed.
            </p>
            <Button variant="kitSolid" size="kit"
              type="submit"
              disabled={loading || !name}
              className="w-full px-4 py-3 tracking-wider"
            >
              {loading ? "Creating…" : "Create workspace"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
