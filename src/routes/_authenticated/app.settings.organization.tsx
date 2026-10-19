import { createFileRoute } from "@tanstack/react-router";
import { ModulePicker, ALL_MODULES, toEnabledModules } from "@/components/settings/module-picker";
import { EligibilityFields } from "@/components/billing/eligibility-fields";
import type { WorkspaceModule } from "@/components/app/nav";
import { SettingsShell, SettingsField, SettingsInput, SettingsSelect } from "@/components/settings/settings-shell";
import { useAdminContext, logAudit } from "@/lib/settings/use-admin";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

import { SectionTitle } from "@/components/ui/section-title";
export const Route = createFileRoute("/_authenticated/app/settings/organization")({
  head: () => ({ meta: [{ title: "Organization — Settings" }] }),
  component: OrganizationPage,
});

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "SEK", "INR", "BRL", "MXN", "ZAR", "CNY", "SGD", "AED"];
const TIMEZONES = ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Sao_Paulo", "Europe/London", "Europe/Berlin", "Europe/Paris", "Europe/Madrid", "Africa/Cairo", "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

type OrgForm = {
  name: string; default_currency: string; address: string; phone: string;
  email: string; website: string; tax_id: string; logo_url: string;
  timezone: string; fiscal_year_start_month: number;
};

function OrganizationPage() {
  const { orgId, membership, isAdmin } = useAdminContext();
  const qc = useQueryClient();
  const [form, setForm] = useState<OrgForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [modules, setModules] = useState<WorkspaceModule[]>(ALL_MODULES);
  const [bands, setBands] = useState({ employee: "", revenue: "" });

  useEffect(() => {
    if (!membership) return;
    const o = membership.organizations as unknown as Record<string, string | number | null>;
    setForm({
      name: (o.name as string) ?? "",
      default_currency: (o.default_currency as string) ?? "USD",
      address: (o.address as string) ?? "",
      phone: (o.phone as string) ?? "",
      email: (o.email as string) ?? "",
      website: (o.website as string) ?? "",
      tax_id: (o.tax_id as string) ?? "",
      logo_url: (o.logo_url as string) ?? "",
      timezone: (o.timezone as string) ?? "UTC",
      fiscal_year_start_month: Number(o.fiscal_year_start_month ?? 1),
    });
    setModules((membership.organizations.enabled_modules as WorkspaceModule[] | null) ?? ALL_MODULES);
    setBands({ employee: String(o.employee_band ?? ""), revenue: String(o.revenue_band ?? "") });
  }, [membership]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !form) return;
    setSaving(true);
    const old = membership?.organizations;
    if (!modules.length) { setSaving(false); return toast.error("Keep at least one module switched on"); }
    const { error } = await supabase.from("organizations").update({ ...form, enabled_modules: toEnabledModules(modules) }).eq("id", orgId);
    setSaving(false);
    if (error) return toast.error(error.message);
    // Saved on its own so the rest still saves on a database without DB-27.
    await supabase.from("organizations")
      .update({ employee_band: bands.employee || null, revenue_band: bands.revenue || null }).eq("id", orgId);
    toast.success("Organization updated");
    void qc.invalidateQueries({ queryKey: ["my-memberships"] });
    logAudit({ orgId, action: "organization.update", entityType: "organization", entityId: orgId, oldValues: old, newValues: form });
  }

  if (!form) return <SettingsShell title="Organization" breadcrumb="settings · organization"><div className="font-mono text-xs text-muted-foreground">Loading…</div></SettingsShell>;

  const set = <K extends keyof OrgForm>(k: K, v: OrgForm[K]) => setForm({ ...form, [k]: v });

  return (
    <SettingsShell title="Organization" breadcrumb="settings · organization">
      <form onSubmit={save} className="space-y-8">
        <section className="border border-border bg-card shadow-sm p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-14 items-center justify-center border border-border bg-muted">
              {form.logo_url ? (
                <img src={form.logo_url} alt="Logo" className="size-full object-cover" />
              ) : (
                <Building2 className="size-6 text-muted-foreground" />
              )}
            </div>
            <div>
              <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Company profile</div>
              <div className="text-lg font-semibold">{form.name || "Untitled organization"}</div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SettingsField label="Company name">
              <SettingsInput required value={form.name} onChange={(e) => set("name", e.target.value)} disabled={!isAdmin} />
            </SettingsField>
            <SettingsField label="Logo URL" hint="Direct link to your logo (upload coming soon).">
              <SettingsInput value={form.logo_url} onChange={(e) => set("logo_url", e.target.value)} placeholder="https://…" disabled={!isAdmin} />
            </SettingsField>
            <SettingsField label="Email">
              <SettingsInput type="email" value={form.email} onChange={(e) => set("email", e.target.value)} disabled={!isAdmin} />
            </SettingsField>
            <SettingsField label="Phone">
              <SettingsInput value={form.phone} onChange={(e) => set("phone", e.target.value)} disabled={!isAdmin} />
            </SettingsField>
            <SettingsField label="Website">
              <SettingsInput value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://…" disabled={!isAdmin} />
            </SettingsField>
            <SettingsField label="Tax ID" hint="EIN, VAT, GST or similar.">
              <SettingsInput value={form.tax_id} onChange={(e) => set("tax_id", e.target.value)} disabled={!isAdmin} />
            </SettingsField>
            <SettingsField label="Address">
              <SettingsInput value={form.address} onChange={(e) => set("address", e.target.value)} disabled={!isAdmin} />
            </SettingsField>
          </div>
        </section>

        <section className="border border-border bg-card shadow-sm p-6">
          <div className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">Regional</div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <SettingsField label="Currency">
              <SettingsSelect value={form.default_currency} onChange={(e) => set("default_currency", e.target.value)} disabled={!isAdmin}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </SettingsSelect>
            </SettingsField>
            <SettingsField label="Timezone">
              <SettingsSelect value={form.timezone} onChange={(e) => set("timezone", e.target.value)} disabled={!isAdmin}>
                {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
              </SettingsSelect>
            </SettingsField>
            <SettingsField label="Fiscal year starts">
              <SettingsSelect value={String(form.fiscal_year_start_month)} onChange={(e) => set("fiscal_year_start_month", Number(e.target.value))} disabled={!isAdmin}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </SettingsSelect>
            </SettingsField>
          </div>
        </section>

        <section className="border border-border bg-card shadow-sm p-6">
          <SectionTitle>About your business</SectionTitle>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            The free Startup plan is for businesses with 15 or fewer people or under $100,000 a year in revenue.
          </p>
          <EligibilityFields employee={bands.employee} revenue={bands.revenue} onChange={setBands} disabled={!isAdmin} />
        </section>

        <section className="border border-border bg-card shadow-sm p-6">
          <SectionTitle>Modules</SectionTitle>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            Switched-off modules leave the sidebar, search and dashboard for everyone in this workspace. Nothing is deleted,
            and links to their pages still work.
          </p>
          <ModulePicker value={modules} onChange={setModules} disabled={!isAdmin} />
        </section>

        {isAdmin ? (
          <div className="flex justify-end">
            <Button variant="kitSolid" size="kit" type="submit" disabled={saving} className="bg-primary px-5 py-2.5 text-primary-foreground hover:opacity-90">
              <Save className="size-3.5" /> {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        ) : (
          <div className="border border-border bg-muted px-4 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Read-only · only org admins can update these settings.
          </div>
        )}
      </form>
    </SettingsShell>
  );
}
