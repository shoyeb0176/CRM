import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentMembership } from "@/lib/use-current-org";

export type ModuleKey =
  | "crm" | "sales" | "invoices" | "inventory" | "purchasing"
  | "accounting" | "projects" | "hr" | "reports" | "settings";

export type Plan = {
  id: string; code: string; name: string; description: string | null;
  price_monthly: number; price_yearly: number; currency: string;
  user_limit: number | null; modules: string[]; features: string[];
  is_active: boolean; sort_order: number;
  stripe_price_id_monthly: string | null; stripe_price_id_yearly: string | null;
  /** tier: the plans on the pricing page (Startup … Enterprise). free_package / package / storage:
   *  the earlier prepaid model. legacy: old per-seat plans. */
  plan_kind: "tier" | "free_package" | "package" | "storage" | "legacy";
  tier_key: string | null;
  limits: PlanLimits;
  term_months: number | null; price_total: number | null;
  storage_limit_gb: number | null; bandwidth_limit_gb: number | null; is_public: boolean;
};

/** Limits from the plan (migration 0042); a missing key means no limit. */
export type PlanLimits = Partial<Record<
  "contacts" | "open_pipeline" | "active_projects" | "employees" | "invoices_month" | "automations" | "ai_actions_month" | "storage_gb", number
>> & { sponsor_offers?: boolean };

export type OrgSubscription = {
  id: string; org_id: string; plan_id: string;
  status: "trialing" | "active" | "past_due" | "canceled" | "expired" | "incomplete";
  billing_cycle: "monthly" | "yearly";
  current_period_start: string | null; current_period_end: string | null;
  trial_ends_at: string | null; trial_started_at: string | null; canceled_at: string | null;
  stripe_customer_id: string | null; stripe_subscription_id: string | null;
  notes: string | null;
};

export function useOrgSubscription() {
  const orgId = useCurrentMembership().membership?.org_id ?? null;
  return useQuery({
    queryKey: ["org-subscription", orgId],
    staleTime: 5 * 60_000, // changes through actions that refresh it; no need to re-ask on every page
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_subscriptions")
        .select("*, plan:plan_id(*)")
        .eq("org_id", orgId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return data as unknown as OrgSubscription & { plan: Plan };
    },
  });
}

export function usePlans() {
  return useQuery({
    queryKey: ["subscription-plans"],
    staleTime: 5 * 60_000, // changes through actions that refresh it; no need to re-ask on every page
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as Plan[];
    },
  });
}

/** Plans a company can buy now: active, public, priced packages and storage plans. */
export function useBuyablePlans() {
  const plans = usePlans();
  return {
    ...plans,
    data: plans.data?.filter(
      (p) => p.is_public && (p.plan_kind === "package" || p.plan_kind === "storage") && Number(p.price_total) > 0,
    ),
  };
}

/**
 * Where the company's plan stands: mirrors public.org_is_active (dates and status).
 * `lapsed` = the database has made business data read-only until they renew.
 */
export function usePlanStatus() {
  const sub = useOrgSubscription();
  const s = sub.data;
  if (!s) return { isLoading: sub.isLoading, lapsed: false, endsAt: null as Date | null, daysLeft: null as number | null, kind: null, planName: "" };
  const end = s.status === "trialing" && s.trial_ends_at ? s.trial_ends_at : s.current_period_end;
  const endsAt = end ? new Date(end) : null;
  const statusOk = s.status === "active" || s.status === "trialing" || s.status === "past_due";
  // A free first year never locks: when it ends the workspace moves to Startup.
  const lapsed = s.plan?.plan_kind === "free_package" ? false : !statusOk || (!!endsAt && endsAt.getTime() <= Date.now());
  const daysLeft = endsAt ? Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / 86_400_000)) : null;
  return { isLoading: false, lapsed, endsAt, daysLeft, kind: s.plan?.plan_kind ?? null, planName: s.plan?.name ?? "" };
}

export type OrgUsage = {
  plan: string | null; tier: string | null; kind: string | null; ends: string | null;
  limits: PlanLimits;
  usage: Record<"contacts" | "open_pipeline" | "active_projects" | "employees" | "invoices_month" | "automations", { used: number; limit: number | null }>;
  ai: AiUsage;
  storage: { used_bytes: number; limit_gb: number | null };
};
export type AiUsage = { used: number; limit: number | null; own_key: number; resets_on: string };

/** The plan, its limits and how much of each is used (Settings › Billing). */
export function useOrgUsage() {
  const orgId = useCurrentMembership().membership?.org_id ?? null;
  return useQuery({
    queryKey: ["org-usage", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("org_usage", { _org: orgId! });
      if (error) return null; // database update not applied yet
      return data as unknown as OrgUsage;
    },
  });
}

/** This month's AI actions (the assistant panel and Settings › AI). */
export function useAiUsage(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ["ai-actions", orgId],
    enabled: !!orgId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ai_usage_summary", { _org: orgId! });
      if (error) return null;
      return data as unknown as AiUsage;
    },
  });
}

export function useUsage() {
  const orgId = useCurrentMembership().membership?.org_id ?? null;
  return useQuery({
    queryKey: ["usage-limits", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { count } = await supabase
        .from("memberships")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId!).eq("status", "active");
      return { users_count: count ?? 0 };
    },
  });
}

export const STARTER_MODULES: ModuleKey[] = ["crm", "invoices", "inventory", "settings"];

/** Days left in the trial, or null when not on an active trial. */
export function useTrialStatus() {
  const sub = useOrgSubscription();
  const s = sub.data;
  if (!s || s.status !== "trialing" || !s.trial_ends_at) return { isTrial: false, daysLeft: 0, expired: false };
  const ms = new Date(s.trial_ends_at).getTime() - Date.now();
  const daysLeft = Math.max(0, Math.ceil(ms / 86_400_000));
  return { isTrial: true, daysLeft, expired: ms <= 0, planName: s.plan?.name ?? "" };
}

/** True when this workspace may still start its one free Business trial. */
export function useCanStartTrial() {
  const sub = useOrgSubscription();
  const s = sub.data;
  // Only the old per-seat plans had a Business trial; every package already includes all modules.
  const canStart =
    !sub.isLoading && !!s && s.plan?.plan_kind === "legacy" &&
    !s.trial_started_at && !s.stripe_subscription_id && s.plan?.code !== "business";
  return { canStart, isLoading: sub.isLoading };
}

export function useModuleAccess(module: ModuleKey) {
  const sub = useOrgSubscription();
  const isLoading = sub.isLoading;
  const s = sub.data;
  const planName = s?.plan?.name ?? "—";
  const status = s?.status;

  // Packages and storage plans include every module. When one lapses, data stays readable and
  // the database blocks changes (public.org_has_module), so the screens stay open.
  if (s && s.plan?.plan_kind && s.plan.plan_kind !== "legacy") {
    return { isLoading, allowed: true, planName, subscription: s };
  }
  const active = status === "active" || status === "trialing" || status === "past_due";

  const trialExpired =
    status === "trialing" && !!s?.trial_ends_at && new Date(s.trial_ends_at).getTime() <= Date.now();

  // Expired trial falls back to the free Starter module set instead of locking everything out.
  const modules = trialExpired
    ? STARTER_MODULES
    : ((s?.plan?.modules ?? []) as ModuleKey[]);

  // The free Starter modules are always open — even after a cancellation.
  const onStarter = trialExpired || s?.plan?.code === "starter";
  const allowed =
    (onStarter && STARTER_MODULES.includes(module)) || (active && modules.includes(module));
  return {
    isLoading,
    allowed,
    planName: trialExpired ? "Starter" : planName,
    subscription: s ?? null,
  };
}

export function fmtMoney(n: number, ccy = "USD") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(n);
}
