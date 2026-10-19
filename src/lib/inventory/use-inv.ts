import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/lib/crm/use-org";

export function useWarehouses() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["warehouses", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses").select("*").eq("org_id", orgId!).eq("is_active", true).order("is_default", { ascending: false }).order("name");
      if (error) throw error;
      // Auto-seed default warehouse if none
      if (!data || data.length === 0) {
        await supabase.rpc("seed_default_warehouse", { _org: orgId! });
        const r = await supabase.from("warehouses").select("*").eq("org_id", orgId!).order("name");
        return r.data ?? [];
      }
      return data;
    },
  });
}

export function useProductCategories() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["product-categories", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_categories").select("*").eq("org_id", orgId!).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSuppliersMin() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["suppliers-min", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers").select("id, name").eq("org_id", orgId!).eq("archived", false).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type StockStatus = "out" | "low" | "ok";
export function stockStatus(qty: number, threshold: number | null | undefined): StockStatus {
  if (qty <= 0) return "out";
  if (threshold != null && qty <= Number(threshold)) return "low";
  return "ok";
}

export function fmtMoney(n: number, ccy = "USD") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: ccy }).format(Number(n) || 0);
}
