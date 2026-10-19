// Purchasing list queries, shared by the list pages and the prefetch when you point at their tab.
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cleanTerm, type ListPage } from "@/lib/list-query";

export type SupplierFilter = { status: string; supplier: string };
export const ALL_SUPPLIERS: SupplierFilter = { status: "all", supplier: "all" };

async function supplierIds(orgId: string, term: string) {
  const { data } = await supabase.from("suppliers").select("id").eq("org_id", orgId).ilike("name", `%${term}%`).limit(50);
  return (data ?? []).map((x) => x.id);
}

export const suppliersMin = (orgId: string | null | undefined) => queryOptions({
  queryKey: ["suppliers-min", orgId], enabled: !!orgId,
  queryFn: async () => (await supabase.from("suppliers").select("id, name").eq("org_id", orgId!).eq("archived", false).order("name")).data ?? [],
});

export const purchaseOrdersList = (orgId: string | null | undefined, f: SupplierFilter, p: ListPage) => queryOptions({
  queryKey: ["pos", orgId, f.status, f.supplier, p.q, p.page, p.size], enabled: !!orgId,
  placeholderData: keepPreviousData,
  queryFn: async () => {
    let q = supabase.from("purchase_orders")
      .select("id, po_number, reference, status, order_date, expected_date, total, currency, supplier_id, created_at, suppliers:supplier_id(id, name)", { count: "exact" })
      .eq("org_id", orgId!).order("created_at", { ascending: false });
    if (f.status !== "all") q = q.eq("status", f.status as never);
    if (f.supplier !== "all") q = q.eq("supplier_id", f.supplier);
    const term = cleanTerm(p.q);
    if (term) {
      const ids = await supplierIds(orgId!, term);
      q = q.or([`po_number.ilike.%${term}%`, `reference.ilike.%${term}%`, ...(ids.length ? [`supplier_id.in.(${ids.join(",")})`] : [])].join(","));
    }
    const { data, count, error } = await q.range(p.from, p.to);
    if (error) throw error;
    return { rows: data ?? [], total: count ?? 0 };
  },
});

// Bills past their due date become "overdue" here; once per workspace per session is enough.
const overdueMarked = new Set<string>();

export const vendorBillsList = (orgId: string | null | undefined, f: SupplierFilter, p: ListPage) => queryOptions({
  queryKey: ["vendor-bills", orgId, f.status, f.supplier, p.q, p.page, p.size], enabled: !!orgId,
  placeholderData: keepPreviousData,
  queryFn: async () => {
    if (!overdueMarked.has(orgId!)) {
      overdueMarked.add(orgId!);
      await supabase.rpc("mark_overdue_vendor_bills", { _org: orgId! });
    }
    let q = supabase.from("vendor_bills")
      .select("id, bill_number, status, bill_date, due_date, total, balance_due, currency, supplier_id, created_at, suppliers:supplier_id(id, name)", { count: "exact" })
      .eq("org_id", orgId!).order("created_at", { ascending: false });
    if (f.status !== "all") q = q.eq("status", f.status as never);
    if (f.supplier !== "all") q = q.eq("supplier_id", f.supplier);
    const term = cleanTerm(p.q);
    if (term) {
      const ids = await supplierIds(orgId!, term);
      q = q.or([`bill_number.ilike.%${term}%`, ...(ids.length ? [`supplier_id.in.(${ids.join(",")})`] : [])].join(","));
    }
    const { data, count, error } = await q.range(p.from, p.to);
    if (error) throw error;
    return { rows: data ?? [], total: count ?? 0 };
  },
});
