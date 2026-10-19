// Sales list queries, shared by the list pages and the prefetch when you point at their tab.
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cleanTerm, type ListPage } from "@/lib/list-query";

/** Companies whose name matches, so a search finds documents by customer too. */
async function companyIds(orgId: string, term: string) {
  const { data } = await supabase.from("companies").select("id").eq("org_id", orgId).ilike("name", `%${term}%`).limit(50);
  return (data ?? []).map((c) => c.id);
}

export const quotesList = (orgId: string | null | undefined, p: ListPage) => queryOptions({
  queryKey: ["quotes", orgId, p.q, p.page, p.size], enabled: !!orgId,
  placeholderData: keepPreviousData,
  queryFn: async () => {
    let q = supabase.from("quotes")
      .select("id, number, status, issue_date, expiry_date, total, currency, created_at, contacts:contact_id(id, first_name, last_name), companies:company_id(id, name)", { count: "exact" })
      .eq("org_id", orgId!).order("created_at", { ascending: false });
    const term = cleanTerm(p.q);
    if (term) {
      const ids = await companyIds(orgId!, term);
      q = q.or([`number.ilike.%${term}%`, ...(ids.length ? [`company_id.in.(${ids.join(",")})`] : [])].join(","));
    }
    const { data, count, error } = await q.range(p.from, p.to);
    if (error) throw error;
    return { rows: data ?? [], total: count ?? 0 };
  },
});

export const salesOrdersList = (orgId: string | null | undefined, p: ListPage) => queryOptions({
  queryKey: ["sales-orders", orgId, p.q, p.page, p.size], enabled: !!orgId,
  placeholderData: keepPreviousData,
  queryFn: async () => {
    let q = supabase.from("sales_orders")
      .select("id, number, status, order_date, expected_delivery, total, currency, created_at, contacts:contact_id(id, first_name, last_name), companies:company_id(id, name)", { count: "exact" })
      .eq("org_id", orgId!).order("created_at", { ascending: false });
    const term = cleanTerm(p.q);
    if (term) {
      const ids = await companyIds(orgId!, term);
      q = q.or([`number.ilike.%${term}%`, ...(ids.length ? [`company_id.in.(${ids.join(",")})`] : [])].join(","));
    }
    const { data, count, error } = await q.range(p.from, p.to);
    if (error) throw error;
    return { rows: data ?? [], total: count ?? 0 };
  },
});
