import { describe, expect, test } from "bun:test";
import { STANDARD, STEP2, federalWithholding, grossPay, payLine, type W4 } from "./us";

const w4 = (o: Partial<W4> = {}): W4 => ({ filingStatus: "single", step2: false, dependents: 0, otherIncome: 0, deductions: 0, extraWithholding: 0, ...o });

describe("Pub 15-T tables", () => {
  test("each row's tentative amount follows from the row before (catches typos)", () => {
    for (const set of [STANDARD, STEP2]) {
      for (const rows of Object.values(set)) {
        for (let i = 1; i < rows.length; i++) {
          const [a0, c0, r0] = rows[i - 1];
          const [a1, c1] = rows[i];
          expect(Math.abs(c0 + (a1 - a0) * r0 - c1)).toBeLessThan(1);
        }
      }
    }
  });
});

describe("federal withholding", () => {
  test("single, biweekly $2,000", () => {
    // (52,000 - 8,600) = 43,400 → 1,240 + 12% × 23,500 = 4,060 a year
    expect(federalWithholding(2000, 26, w4())).toBe(156.15);
  });
  test("married, monthly $10,000, $4,000 dependents credit", () => {
    // (120,000 - 12,900) = 107,100 → 2,480 + 12% × 63,000 = 10,040; /12 − 4,000/12
    expect(federalWithholding(10000, 12, w4({ filingStatus: "married_jointly", dependents: 4000 }))).toBe(503.33);
  });
  test("step 2 box uses the higher schedule and skips the 8,600", () => {
    // 52,000 → 2,900 + 22% × 18,750 = 7,025 a year
    expect(federalWithholding(2000, 26, w4({ step2: true }))).toBe(270.19);
  });
  test("low pay withholds nothing; credits never make it negative; extra is added", () => {
    expect(federalWithholding(300, 26, w4())).toBe(0);
    expect(federalWithholding(2000, 26, w4({ dependents: 10000 }))).toBe(0);
    expect(federalWithholding(2000, 26, w4({ extraWithholding: 25 }))).toBe(181.15);
  });
});

describe("pay line", () => {
  test("adds up: gross = net + deductions + employee taxes", () => {
    const l = payLine({ gross: 2000, periods: 26, w4: w4(), retirementPercent: 5, health: 50, stateRatePercent: 4 });
    expect(l.retirement).toBe(100);
    expect(l.social_security).toBe(120.9); // 6.2% of 1,950 (401(k) still taxed, health not)
    expect(l.medicare).toBe(28.28);
    expect(l.state_tax).toBe(74); // 4% of 1,850
    const sum = l.net + l.retirement + l.health + l.federal_tax + l.social_security + l.medicare + l.state_tax;
    expect(Math.round(sum * 100) / 100).toBe(l.gross);
  });
  test("Social Security stops at the wage base; Additional Medicare starts over $200k", () => {
    const l = payLine({ gross: 1000, periods: 26, w4: w4(), ytdFicaWages: 184_000 });
    expect(l.social_security).toBe(31);
    expect(l.employer_social_security).toBe(31);
    const m = payLine({ gross: 1000, periods: 26, w4: w4(), ytdFicaWages: 199_500 });
    expect(m.medicare).toBe(19); // 14.50 + 0.9% × 500
    expect(m.employer_medicare).toBe(14.5);
  });
  test("FUTA only on the first $7,000 a year", () => {
    expect(payLine({ gross: 2000, periods: 26, w4: w4() }).futa).toBe(12);
    expect(payLine({ gross: 2000, periods: 26, w4: w4(), ytdFicaWages: 6000 }).futa).toBe(6);
    expect(payLine({ gross: 2000, periods: 26, w4: w4(), ytdFicaWages: 8000 }).futa).toBe(0);
  });
  test("gross from salary or hours", () => {
    expect(grossPay({ base_salary: 52000 }, 26, 80)).toBe(2000);
    expect(grossPay({ hourly_rate: 20 }, 26, 80)).toBe(1600);
  });
});
