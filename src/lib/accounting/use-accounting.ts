import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId, useOrgRole } from "@/lib/crm/use-org";

const ACCOUNTING_ROLES = ["org_owner", "org_admin", "accountant"] as const;

export function useCanAccessAccounting() {
  const role = useOrgRole();
  return !!role && (ACCOUNTING_ROLES as readonly string[]).includes(role);
}

// Workspaces already seeded in this browser session; the seed is a no-op after the first time.
const seeded = new Set<string>();

export function useEnsureCOA() {
  const orgId = useOrgId();
  useEffect(() => {
    if (!orgId || seeded.has(orgId)) return;
    seeded.add(orgId);
    // Best-effort seed; ignored if accounts already exist.
    supabase.rpc("seed_default_coa", { _org: orgId }).then(() => {});
  }, [orgId]);
}

export function useAccounts() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["coa", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("*")
        .eq("org_id", orgId!)
        .order("code");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function fmtMoney(n: number | string | null | undefined, ccy = "USD") {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: ccy,
    minimumFractionDigits: 2,
  }).format(v || 0);
}

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expense",
  cogs: "Cost of Goods Sold",
};

/** Sign convention: assets/expenses/cogs are debit-normal (+), the rest credit-normal (-). */
export function signedBalance(type: string, debit: number, credit: number) {
  const normalDebit = type === "asset" || type === "expense" || type === "cogs";
  return normalDebit ? debit - credit : credit - debit;
}
