import { createFileRoute } from "@tanstack/react-router";
import { Stat } from "@/components/ui/kpi-tile";
import { useState } from "react";
import { SettingsShell } from "@/components/settings/settings-shell";
import { useAdminContext } from "@/lib/settings/use-admin";
import {
  useOrgSubscription, useBuyablePlans, usePlanStatus, useUsage, useOrgUsage, usePlans, fmtMoney, type Plan,
} from "@/lib/billing/use-subscription";
import { TIERS, tierPrice } from "@/lib/billing/pricing";
import { openReportDialog } from "@/lib/feedback/feedback";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, Briefcase, Check, Contact, CreditCard, ExternalLink, FileText, HardDrive, Sparkles, Target, UserRound, Users, Workflow, X } from "lucide-react";
import { StripeEmbeddedCheckoutInline } from "@/components/billing/stripe-embedded-checkout";
import { PaymentTestModeBanner } from "@/components/billing/payment-test-mode-banner";
import { createOrgBillingPortalSession } from "@/lib/billing/billing.functions";
import { getStripeEnvironment } from "@/lib/stripe";

import { friendlyError } from "@/lib/friendly-error";
import { startupEligible } from "@/lib/billing/eligibility";
import { useCurrentMembership } from "@/lib/use-current-org";
export const Route = createFileRoute("/_authenticated/app/settings/billing")({
  head: () => ({ meta: [{ title: "Billing — Settings" }] }),
  component: BillingPage,
});

const GB = 1024 ** 3;

function BillingPage() {
  const { orgId, isAdmin } = useAdminContext();
  const org = useCurrentMembership().membership?.organizations as (Record<string, unknown> & { employee_band?: string | null; revenue_band?: string | null }) | undefined;
  const sub = useOrgSubscription();
  const status = usePlanStatus();
  const plans = useBuyablePlans();
  const usage = useUsage();
  const orgUsage = useOrgUsage();
  const allPlans = usePlans();
  const [cadence, setCadence] = useState<"month" | "year">("month");
  const [checkout, setCheckout] = useState<Plan | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const events = useQuery({
    queryKey: ["billing-events", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_events").select("*")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Storage used by file attachments (null until the attachments feature is installed).
  const storage = useQuery({
    queryKey: ["org-storage-used", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("org_storage_used_bytes", { _org: orgId! });
      return error ? null : Number(data ?? 0);
    },
  });

  const current = sub.data;
  const plan = current?.plan;
  const legacy = plan?.plan_kind === "legacy";
  const userLimit = plan?.user_limit ?? null;
  const users = usage.data?.users_count ?? 0;
  const overLimit = userLimit !== null && users > userLimit;
  const storageLimit = plan?.storage_limit_gb != null ? Number(plan.storage_limit_gb) : null;
  const endingSoon = !status.lapsed && status.daysLeft !== null && status.daysLeft <= 30;

  function buy(p: Plan) {
    if (!isAdmin) { toast.error("Only org owners or admins can buy a plan."); return; }
    if (p.user_limit !== null && users > p.user_limit) {
      toast.error(`${p.name} allows ${p.user_limit} users; you have ${users}. Choose a bigger plan.`);
      return;
    }
    setCheckout(p);
  }

  async function openPortal() {
    if (!orgId) return;
    setPortalLoading(true);
    try {
      const result = await createOrgBillingPortalSession({
        data: { orgId, returnUrl: `${window.location.origin}/app/settings/billing`, environment: getStripeEnvironment() },
      });
      if ("error" in result) throw new Error(result.error);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(friendlyError(e, "Could not open billing portal"));
    } finally {
      setPortalLoading(false);
    }
  }

  return (
    <SettingsShell title="Billing & subscription" breadcrumb="settings · billing">
      <PaymentTestModeBanner />

      {status.lapsed && (
        <div role="alert" className="mb-6 flex items-start gap-3 border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>
            <strong>Your plan has ended.</strong> Everything is still here and readable, but changes are paused until you
            choose a package below.
          </span>
        </div>
      )}
      {endingSoon && (
        <div role="status" className="mb-6 flex items-start gap-3 border border-primary/40 bg-primary/5 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            <strong>{plan?.name}</strong> ends in {status.daysLeft} day{status.daysLeft === 1 ? "" : "s"}
            {status.endsAt ? ` (${status.endsAt.toLocaleDateString()})` : ""}. Choose a package to keep making changes after that.
          </span>
        </div>
      )}

      {/* CURRENT PLAN */}
      <section className="mb-8 border border-border bg-card shadow-sm p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Current plan</div>
            <div className="mt-1 flex items-baseline gap-3">
              <h2 className="font-display text-3xl uppercase tracking-tight">{plan?.name ?? "—"}</h2>
              <span className={`px-2 py-0.5 font-mono text-xs uppercase tracking-wider ${
                status.lapsed ? "bg-destructive text-destructive-foreground"
                  : current?.status === "active" ? "bg-primary text-primary-foreground"
                  : "border border-border bg-muted text-foreground"
              }`}>{status.lapsed ? "ended" : current?.status ?? "—"}</span>
            </div>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">{plan?.description}</p>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <Stat label={status.lapsed ? "Ended" : "Ends"} value={status.endsAt ? status.endsAt.toLocaleDateString() : "No end date"} />
            <Stat label="Time left" value={status.lapsed ? "—" : status.daysLeft === null ? "—" : `${status.daysLeft} days`} />
          </div>
        </div>

        {overLimit && (
          <div className="mt-6 flex items-center gap-3 border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
            <AlertTriangle className="size-4 text-destructive" />
            <span>You have <strong>{users}</strong> active members but your plan allows <strong>{userLimit}</strong>. Choose a bigger package to add more.</span>
          </div>
        )}

        {plan?.code === "tier_startup" && startupEligible(org?.employee_band, org?.revenue_band) === false && (
          <div className="mt-6 flex items-start gap-3 border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              Your answers in Settings › Organization say this business has more than 15 people and over $100,000 a year
              in revenue. Startup is for smaller businesses, so please choose a paid plan below.
            </span>
          </div>
        )}

        {plan?.plan_kind === "free_package" && status.endsAt && (
          <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
            Your free first year runs until {status.endsAt.toLocaleDateString()}. After that the workspace moves to the free
            Startup plan and keeps working, with Startup's limits. You can move to a bigger plan at any time.
          </p>
        )}

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {orgUsage.data && (
            <Meter icon={Sparkles} label="AI actions this month" used={orgUsage.data.ai.used} limit={orgUsage.data.ai.limit} format={(n) => n.toLocaleString()}
              note={`Resets ${new Date(orgUsage.data.ai.resets_on).toLocaleDateString()}.${orgUsage.data.ai.own_key ? ` ${orgUsage.data.ai.own_key} more on your own AI key (not counted).` : ""}`} />
          )}
          {orgUsage.data && LIMIT_METERS.map(([key, label, icon]) => (
            <Meter key={key} icon={icon} label={label} used={orgUsage.data!.usage[key]?.used ?? null} limit={orgUsage.data!.usage[key]?.limit ?? null} format={(n) => n.toLocaleString()} />
          ))}
          <Meter icon={Users} label="Users" used={users} limit={userLimit} format={(n) => String(n)} />
          <Meter
            icon={HardDrive} label="Storage"
            used={storage.data ?? null} limit={(orgUsage.data?.storage.limit_gb ?? storageLimit) != null ? Number(orgUsage.data?.storage.limit_gb ?? storageLimit) * GB : null}
            format={(n) => n >= GB ? `${(n / GB).toFixed(2)} GB` : `${(n / 1024 ** 2).toFixed(1)} MB`}
            note={plan?.bandwidth_limit_gb != null ? `Bandwidth: ${plan.bandwidth_limit_gb} GB / month (not measured yet)` : undefined}
          />
          <div className="border border-border bg-muted/40 p-4">
            <div className="mb-1 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
              <CreditCard className="size-3" /> Payments
            </div>
            {legacy && current?.stripe_subscription_id ? (
              <Button variant="bare" size="bare" onClick={openPortal} disabled={portalLoading} className="inline-flex items-center gap-1 text-sm hover:underline disabled:opacity-50">
                Manage subscription <ExternalLink className="size-3" />
              </Button>
            ) : (
              <div className="text-sm text-muted-foreground">
                {plan?.plan_kind === "free_package" || (plan?.plan_kind === "tier" && !Number(plan.price_monthly)) ? "Free, nothing to pay."
                  : plan?.plan_kind === "tier" ? "Invoiced by the Inuberry team until online payment opens." : "Prepaid. Receipts are emailed by Stripe."}
              </div>
            )}
          </div>
        </div>
        {legacy && (
          <p className="mt-4 text-xs text-muted-foreground">
            You're on an older per-user plan. It keeps working until it renews; then choose one of the plans below.
          </p>
        )}
      </section>

      {/* PLANS */}
      <section className="mb-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Plans</div>
            <h3 className="font-display text-xl uppercase tracking-tight">We charge for what your business needs</h3>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Every plan includes every module. Online payment isn't open yet: ask to upgrade and the Inuberry team moves you
              over and sends an invoice. A year costs ten months.
            </p>
          </div>
          <div className="flex border border-border" role="group" aria-label="Show prices">
            {(["month", "year"] as const).map((c) => (
              <Button variant="bare" size="bare" key={c} type="button" onClick={() => setCadence(c)} aria-pressed={cadence === c}
                className={`px-3 py-1.5 font-mono text-xs uppercase tracking-widest ${cadence === c ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
                {c === "month" ? "Monthly" : "Yearly"}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {TIERS.map((t) => {
            const isCurrent = plan?.plan_kind === "tier" && plan.tier_key === t.key;
            const db = allPlans.data?.find((p) => p.plan_kind === "tier" && p.tier_key === t.key);
            const limits = db?.features?.length ? db.features : t.features.slice(0, 5);
            return (
              <div key={t.key} className={`flex flex-col border ${isCurrent ? "border-primary" : "border-border"} bg-background p-5`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-display text-xl uppercase tracking-tight">{t.name}</div>
                  {isCurrent && <span className="bg-primary px-2 py-0.5 font-mono text-xs uppercase tracking-widest text-primary-foreground">Current</span>}
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-semibold tabular-nums">{tierPrice(t, cadence)}</span>
                  {t.monthly != null && t.monthly > 0 && <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">/ {cadence}</span>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t.forWho}</p>
                <ul className="mt-3 flex-1 space-y-1.5 text-sm">
                  {limits.map((f) => (
                    <li key={f} className="flex items-start gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-primary" /><span>{f}</span></li>
                  ))}
                </ul>
                {!isCurrent && (
                  <Button variant="outline" className="mt-4 w-full" disabled={!isAdmin}
                    onClick={() => openReportDialog("question", `Move ${orgName(sub.data) || "our workspace"} to ${t.name} (${cadence === "year" ? "yearly" : "monthly"})`)}>
                    {t.key === "enterprise" ? "Talk to us" : "Ask to upgrade"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        {!isAdmin && <p className="mt-2 text-xs text-muted-foreground">Only owners and admins can change the plan.</p>}
      </section>

      {plans.data && plans.data.length > 0 && (
        <section className="mb-8">
          <div className="mb-4">
            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Prepaid packages</div>
            <p className="mt-1 text-sm text-muted-foreground">Buying the package you're on before it ends adds the time to the end.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {plans.data.map((p) => (
              <PlanCard key={p.id} plan={p} isCurrent={p.id === current?.plan_id} onBuy={() => buy(p)} />
            ))}
          </div>
        </section>
      )}

      {/* HISTORY */}
      <section className="border border-border bg-background">
        <div className="border-b border-border p-4">
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Billing history</div>
          <div className="text-sm text-muted-foreground">Purchases, payments and plan changes.</div>
        </div>
        {events.data?.length === 0 ? (
          <div className="p-6 text-center font-mono text-xs text-muted-foreground">No billing events yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {events.data?.map((e) => (
              <div key={e.id} className="grid grid-cols-[96px_minmax(0,1fr)_80px] items-center gap-3 px-4 py-3 sm:grid-cols-[160px_minmax(0,1fr)_120px] sm:gap-4">
                <div className="font-mono text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</div>
                <div>
                  <div className="font-mono text-xs uppercase tracking-wider">{e.event_type}</div>
                  {e.description && <div className="text-sm text-muted-foreground">{e.description}</div>}
                </div>
                <div className="text-right font-mono text-sm tabular-nums">
                  {e.amount != null ? fmtMoney(Number(e.amount), e.currency ?? "USD") : "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {checkout && orgId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto border border-border bg-card shadow-sm p-6">
            <Button variant="bare" size="bare"
              onClick={() => setCheckout(null)}
              className="absolute right-4 top-4 inline-flex items-center gap-1 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
              aria-label="Close checkout"
            >
              <X className="size-4" /> Close
            </Button>
            <div className="mb-4">
              <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Checkout</div>
              <h2 className="font-display text-2xl uppercase tracking-tight">{checkout.name}</h2>
            </div>
            <StripeEmbeddedCheckoutInline
              orgId={orgId}
              planId={checkout.id}
              returnUrl={`${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`}
            />
          </div>
        </div>
      )}
    </SettingsShell>
  );
}


const LIMIT_METERS = [
  ["contacts", "Contacts", Contact], ["open_pipeline", "Open leads and deals", Target], ["active_projects", "Active projects", Briefcase],
  ["employees", "Employees", UserRound], ["invoices_month", "Invoices this month", FileText], ["automations", "Automations", Workflow],
] as const;

const orgName = (s: unknown) => (s as { organizations?: { name?: string } } | null)?.organizations?.name ?? "";

function Meter({ icon: Icon, label, used, limit, format, note }: {
  icon: typeof Users | typeof Sparkles; label: string; used: number | null; limit: number | null;
  format: (n: number) => string; note?: string;
}) {
  const pct = used !== null && limit ? Math.min(100, Math.round((used / limit) * 100)) : null;
  return (
    <div className="border border-border bg-muted/40 p-4">
      <div className="mb-1 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
        <Icon className="size-3" /> {label}
      </div>
      <div className="text-sm tabular-nums">
        {used === null ? "—" : format(used)} {limit === null ? <span className="text-muted-foreground">· unlimited</span> : <>/ {format(limit)}</>}
      </div>
      {pct !== null && (
        <div className="mt-2 h-1.5 w-full bg-border" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} used`}>
          <div className={`h-full ${pct >= 90 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      {note && <div className="mt-2 text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}

function PlanCard({ plan, isCurrent, onBuy }: { plan: Plan; isCurrent: boolean; onBuy: () => void }) {
  return (
    <div className={`flex flex-col border ${isCurrent ? "border-primary" : "border-border"} bg-background p-5`}>
      <div className="font-display text-xl uppercase tracking-tight">{plan.name}</div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-3xl font-semibold tabular-nums">{fmtMoney(Number(plan.price_total), plan.currency)}</span>
        <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          / {plan.term_months} month{plan.term_months === 1 ? "" : "s"}, prepaid
        </span>
      </div>
      <div className="mt-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
        {plan.user_limit === null ? "Unlimited users" : `Up to ${plan.user_limit} users`}
        {plan.storage_limit_gb != null && ` · ${plan.storage_limit_gb} GB storage`}
      </div>
      <ul className="mt-4 flex-1 space-y-1.5 text-sm">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Button variant="kit" size="kit"
        onClick={onBuy}
        className="mt-5 w-full border-foreground py-2 hover:bg-foreground hover:text-background"
      >
        {isCurrent ? "Renew / extend" : "Choose plan"}
      </Button>
    </div>
  );
}
