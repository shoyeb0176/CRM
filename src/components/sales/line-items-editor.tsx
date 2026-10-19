import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/lib/crm/use-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { fmtMoney } from "./sales-shell";

import { computeTotals, emptyItem, type LineItem } from "@/lib/sales/line-totals";
export { computeTotals, emptyItem, type LineItem } from "@/lib/sales/line-totals";

export function LineItemsEditor({
  items, onChange, currency = "USD", readOnly,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  currency?: string;
  readOnly?: boolean;
}) {
  const orgId = useOrgId();

  const products = useQuery({
    queryKey: ["products-min", orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from("products")
        .select("id, name, sku, sale_price, description")
        .eq("org_id", orgId!).eq("archived", false).eq("is_active", true)
        .order("name").limit(500);
      return data ?? [];
    },
  });

  const taxes = useQuery({
    queryKey: ["taxes", orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from("taxes").select("*").eq("org_id", orgId!).eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  function update(idx: number, patch: Partial<LineItem>) {
    const next = items.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  }
  function remove(idx: number) { onChange(items.filter((_, i) => i !== idx)); }
  function add() { onChange([...items, emptyItem()]); }

  function pickProduct(idx: number, productId: string) {
    if (productId === "__custom") { update(idx, { product_id: null }); return; }
    const p = products.data?.find((x) => x.id === productId);
    if (!p) return;
    update(idx, {
      product_id: p.id,
      description: p.name + (p.sku ? ` (${p.sku})` : ""),
      unit_price: Number(p.sale_price ?? 0),
    });
  }
  function pickTax(idx: number, taxId: string) {
    if (taxId === "none") { update(idx, { tax_id: null, tax_rate: 0 }); return; }
    const t = taxes.data?.find((x) => x.id === taxId);
    update(idx, { tax_id: taxId, tax_rate: Number(t?.rate ?? 0) });
  }

  const totals = computeTotals(items);

  return (
    <div className="border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30">
            <tr className="text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">
              <th className="px-3 py-2 w-[28%]">Item / Description</th>
              <th className="px-3 py-2 w-20">Qty</th>
              <th className="px-3 py-2 w-28">Price</th>
              <th className="px-3 py-2 w-20">Disc %</th>
              <th className="px-3 py-2 w-28">Tax</th>
              <th className="px-3 py-2 w-28 text-right">Total</th>
              {!readOnly && <th className="px-2 py-2 w-8"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">No line items yet.</td></tr>
            )}
            {items.map((it, idx) => {
              const gross = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
              const net = gross - gross * (Number(it.discount_pct) || 0) / 100;
              const lineTotal = net + net * (Number(it.tax_rate) || 0) / 100;
              return (
                <tr key={idx} className="align-top">
                  <td className="px-3 py-2">
                    {!readOnly && (
                      <Select value={it.product_id ?? "__custom"} onValueChange={(v) => pickProduct(idx, v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick product…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__custom">— Custom line —</SelectItem>
                          {products.data?.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}{p.sku ? ` · ${p.sku}` : ""}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Input
                      className="mt-1 h-8 text-xs"
                      placeholder="Description"
                      value={it.description}
                      readOnly={readOnly}
                      onChange={(e) => update(idx, { description: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input type="number" min={0} step="0.001" className="h-8 text-xs" readOnly={readOnly}
                      value={it.quantity} onChange={(e) => update(idx, { quantity: Number(e.target.value) })} />
                  </td>
                  <td className="px-3 py-2">
                    <Input type="number" min={0} step="0.01" className="h-8 text-xs" readOnly={readOnly}
                      value={it.unit_price} onChange={(e) => update(idx, { unit_price: Number(e.target.value) })} />
                  </td>
                  <td className="px-3 py-2">
                    <Input type="number" min={0} max={100} step="0.01" className="h-8 text-xs" readOnly={readOnly}
                      value={it.discount_pct} onChange={(e) => update(idx, { discount_pct: Number(e.target.value) })} />
                  </td>
                  <td className="px-3 py-2">
                    {!readOnly ? (
                      <Select value={it.tax_id ?? "none"} onValueChange={(v) => pickTax(idx, v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No tax</SelectItem>
                          {taxes.data?.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name} ({Number(t.rate)}%)</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="font-mono text-xs">{Number(it.tax_rate)}%</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{fmtMoney(lineTotal, currency)}</td>
                  {!readOnly && (
                    <td className="px-2 py-2">
                      <Button variant="bare" size="bare" aria-label="Remove line" onClick={() => remove(idx)} className="p-1 text-muted-foreground hover:bg-muted hover:text-destructive">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="border-t border-border p-3">
          <Button size="sm" variant="outline" onClick={add}><Plus className="mr-1 size-3.5" /> Add line</Button>
        </div>
      )}
      <div className="border-t border-border bg-muted/20 px-4 py-3">
        <div className="ml-auto max-w-xs space-y-1 text-sm">
          <Row label="Subtotal" value={fmtMoney(totals.subtotal + totals.discount, currency)} />
          <Row label="Discount" value={`− ${fmtMoney(totals.discount, currency)}`} />
          <Row label="Tax" value={fmtMoney(totals.tax, currency)} />
          <Row label="Total" value={fmtMoney(totals.total, currency)} bold />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-6 ${bold ? "border-t border-border pt-1 font-medium" : ""}`}>
      <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

// Tiny helper: cleanly export item shape derived from any *_items table row.
export function rowsToItems(rows: any[] | null | undefined): LineItem[] {
  if (!rows) return [];
  return rows.map((r) => ({
    id: r.id,
    product_id: r.product_id ?? null,
    description: r.description ?? "",
    quantity: Number(r.quantity ?? 1),
    unit_price: Number(r.unit_price ?? 0),
    discount_pct: Number(r.discount_pct ?? 0),
    tax_id: r.tax_id ?? null,
    tax_rate: Number(r.tax_rate ?? 0),
  }));
}

export function useEnsureItemsLoaded(initial: LineItem[] | undefined, setter: (i: LineItem[]) => void) {
  useEffect(() => { if (initial) setter(initial); /* eslint-disable-next-line */ }, [initial?.length]);
}
