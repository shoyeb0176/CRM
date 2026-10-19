import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Plans on sale, from the database (Platform → Plans), so the landing page and /pricing
// always match what is sold.
export type PublicPlan = {
  id: string; code: string; name: string; description: string | null; plan_kind: string;
  user_limit: number | null; term_months: number | null; price_total: number | null; currency: string;
  storage_limit_gb: number | null; features: string[];
};

export function usePublicPlans() {
  return useQuery({
    queryKey: ["public-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("id,code,name,description,plan_kind,user_limit,term_months,price_total,currency,storage_limit_gb,features")
        .eq("is_active", true).eq("is_public", true).neq("plan_kind", "legacy")
        .order("sort_order");
      if (error) throw error;
      // Paid plans appear once they have a price.
      return ((data ?? []) as PublicPlan[]).filter((p) => p.plan_kind === "free_package" || Number(p.price_total) > 0);
    },
  });
}

export function priceLabel(p: PublicPlan) {
  if (p.plan_kind === "free_package") return { price: "Free", cadence: `for ${p.term_months ?? 12} months` };
  const amount = new Intl.NumberFormat(undefined, { style: "currency", currency: p.currency, maximumFractionDigits: 0 }).format(Number(p.price_total));
  return { price: amount, cadence: `/ ${p.term_months} months, prepaid` };
}

/** One line on who a plan is for, e.g. "Up to 10 users" or "Unlimited users · 50 GB". */
export function planLimits(p: PublicPlan) {
  const users = p.user_limit ? `Up to ${p.user_limit} users` : "Unlimited users";
  return p.storage_limit_gb ? `${users} · ${p.storage_limit_gb} GB` : users;
}
