// Quote, order and invoice line maths, shared by the line editor and tests.
export type LineItem = {
  id?: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  tax_id: string | null;
  tax_rate: number;
};

export function emptyItem(): LineItem {
  return { product_id: null, description: "", quantity: 1, unit_price: 0, discount_pct: 0, tax_id: null, tax_rate: 0 };
}

export function computeTotals(items: LineItem[]) {
  let subtotal = 0, discount = 0, tax = 0;
  for (const it of items) {
    const gross = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
    const d = gross * (Number(it.discount_pct) || 0) / 100;
    const net = gross - d;
    const t = net * (Number(it.tax_rate) || 0) / 100;
    subtotal += net; discount += d; tax += t;
  }
  return { subtotal, discount, tax, total: subtotal + tax };
}
