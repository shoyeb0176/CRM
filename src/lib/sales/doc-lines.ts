import { supabase } from "@/integrations/supabase/client";
import type { LineItem } from "@/components/sales/line-items-editor";

export type DocType = "quote" | "sales_order" | "invoice" | "purchase_order" | "vendor_bill";

/** Atomically replaces all line items of a document in one server-side transaction. */
export async function replaceDocLines(docType: DocType, docId: string, items: LineItem[]) {
  const lines = items.map((it, i) => ({
    position: i,
    product_id: it.product_id ?? null,
    description: it.description || "Item",
    quantity: it.quantity,
    unit_price: it.unit_price,
    discount_pct: it.discount_pct,
    tax_id: it.tax_id ?? null,
    tax_rate: it.tax_rate,
  }));
  const { error } = await supabase.rpc("replace_document_lines", { _doc_type: docType, _doc: docId, _lines: lines as any });
  if (error) throw error;
}

/**
 * Copies a document and its lines into a new draft (quote → order or invoice, order → invoice,
 * invoice → duplicate) in one database step, so a failure can't leave an empty copy behind.
 * Until database update DB-25 is applied the function doesn't exist, and `fallback` does it the
 * old way.
 */
export async function copyDocument(from: DocType, id: string, to: "sales_order" | "invoice", fallback: () => Promise<string>) {
  const { data, error } = await supabase.rpc("copy_document", { _from: from, _id: id, _to: to });
  if (!error) return data as unknown as string;
  if (error.code === "PGRST202" || error.code === "42883") return fallback();
  throw error;
}
