import { describe, expect, test } from "bun:test";
import { colorFor, shares } from "./chart-math";

describe("shares", () => {
  test("always adds up to 100", () => {
    for (const v of [[1, 1, 1], [2500], [3, 7], [1, 2, 3, 4, 5, 6], [0.1, 0.2, 99.7]]) {
      expect(shares(v).reduce((s, x) => s + x, 0)).toBe(100);
    }
  });
  test("one item is the whole bar", () => expect(shares([2500])).toEqual([100]));
  test("thirds round to 34/33/33", () => expect(shares([1, 1, 1]).sort()).toEqual([33, 33, 34]));
  test("nothing gives zeros, negatives count as zero", () => {
    expect(shares([0, 0])).toEqual([0, 0]);
    expect(shares([-5, 5])).toEqual([0, 100]);
  });
});

describe("colorFor", () => {
  test("statuses keep their meaning", () => {
    expect(colorFor("paid", 0)).toBe("var(--success)");
    expect(colorFor("Overdue", 3)).toBe("var(--destructive)");
    expect(colorFor("partially_paid", 1)).toBe("var(--warning)");
    expect(colorFor("in progress", 2)).toBe("var(--info)");
    expect(colorFor("draft", 0)).toBe("var(--muted-foreground)");
  });
  test("other labels take the palette in order", () => {
    expect(colorFor("Discovery", 0)).not.toBe(colorFor("Proposal", 1));
  });
});
