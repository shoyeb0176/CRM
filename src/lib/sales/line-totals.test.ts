import { expect, test } from "bun:test";
import { computeTotals, emptyItem } from "./line-totals";

const line = (o: Partial<ReturnType<typeof emptyItem>>) => ({ ...emptyItem(), ...o });

test("quantity × price, less discount, plus tax on the discounted amount", () => {
  const t = computeTotals([line({ quantity: 3, unit_price: 100, discount_pct: 10, tax_rate: 5 })]);
  expect(t).toEqual({ subtotal: 270, discount: 30, tax: 13.5, total: 283.5 });
});

test("adds up several lines with different tax rates", () => {
  const t = computeTotals([line({ quantity: 2, unit_price: 50, tax_rate: 20 }), line({ quantity: 1, unit_price: 10 })]);
  expect(t.subtotal).toBe(110);
  expect(t.tax).toBe(20);
  expect(t.total).toBe(130);
});

test("blank or bad numbers count as zero, never NaN", () => {
  const t = computeTotals([line({ quantity: NaN, unit_price: 5 }), line({ quantity: 1, unit_price: "" as unknown as number })]);
  expect(t).toEqual({ subtotal: 0, discount: 0, tax: 0, total: 0 });
  expect(computeTotals([]).total).toBe(0);
});
