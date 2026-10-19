// US pay for one employee and one pay period. Federal income tax withholding follows IRS
// Publication 15-T (2026), the percentage method for automated payroll systems with a 2020-or-later
// Form W-4. Also Social Security, Medicare, FUTA and a flat state rate. Pure maths: no tax filing,
// no deposits, no state tables. Update the numbers each January from the new Pub 15-T.

export const TAX_YEAR = 2026;
export const SS_RATE = 0.062;
export const SS_WAGE_BASE = 184_500;
export const MEDICARE_RATE = 0.0145;
export const ADDITIONAL_MEDICARE_RATE = 0.009;
export const ADDITIONAL_MEDICARE_OVER = 200_000;
export const FUTA_RATE = 0.006; // after the full state credit
export const FUTA_WAGE_BASE = 7_000;

export type FilingStatus = "single" | "married_jointly" | "head_of_household";
export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";
export const PERIODS: Record<PayFrequency, number> = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };
/** Usual hours in a period, for hourly staff before anyone edits them. */
export const DEFAULT_HOURS: Record<PayFrequency, number> = { weekly: 40, biweekly: 80, semimonthly: 86.67, monthly: 173.33 };

// Pub 15-T 2026 annual tables, one row per bracket: [wage at least, tentative amount, rate].
type Table = ReadonlyArray<readonly [number, number, number]>;
export const STANDARD: Record<FilingStatus, Table> = {
  married_jointly: [[0, 0, 0], [19_300, 0, 0.10], [44_100, 2_480, 0.12], [120_100, 11_600, 0.22], [230_700, 35_932, 0.24], [422_850, 82_048, 0.32], [531_750, 116_896, 0.35], [788_000, 206_583.5, 0.37]],
  single: [[0, 0, 0], [7_500, 0, 0.10], [19_900, 1_240, 0.12], [57_900, 5_800, 0.22], [113_200, 17_966, 0.24], [209_275, 41_024, 0.32], [263_725, 58_448, 0.35], [648_100, 192_979.25, 0.37]],
  head_of_household: [[0, 0, 0], [15_550, 0, 0.10], [33_250, 1_770, 0.12], [83_000, 7_740, 0.22], [121_250, 16_155, 0.24], [217_300, 39_207, 0.32], [271_750, 56_631, 0.35], [656_150, 191_171, 0.37]],
};
/** For a W-4 with the Step 2 box ticked (two jobs). */
export const STEP2: Record<FilingStatus, Table> = {
  married_jointly: [[0, 0, 0], [16_100, 0, 0.10], [28_500, 1_240, 0.12], [66_500, 5_800, 0.22], [121_800, 17_966, 0.24], [217_875, 41_024, 0.32], [272_325, 58_448, 0.35], [400_450, 103_291.75, 0.37]],
  single: [[0, 0, 0], [8_050, 0, 0.10], [14_250, 620, 0.12], [33_250, 2_900, 0.22], [60_900, 8_983, 0.24], [108_938, 20_512, 0.32], [136_163, 29_224, 0.35], [328_350, 96_489.63, 0.37]],
  head_of_household: [[0, 0, 0], [12_075, 0, 0.10], [20_925, 885, 0.12], [45_800, 3_870, 0.22], [64_925, 8_077.5, 0.24], [112_950, 19_603.5, 0.32], [140_175, 28_315.5, 0.35], [332_375, 95_585.5, 0.37]],
};

export type W4 = {
  filingStatus: FilingStatus;
  step2: boolean;
  /** Step 3: yearly credit for dependents. */
  dependents: number;
  /** Step 4(a): other yearly income. */
  otherIncome: number;
  /** Step 4(b): yearly deductions. */
  deductions: number;
  /** Step 4(c): extra withholding each pay period. */
  extraWithholding: number;
};

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Federal income tax to withhold this period (Pub 15-T Worksheet 1A). */
export function federalWithholding(taxableWages: number, periods: number, w4: W4) {
  const annual = taxableWages * periods + w4.otherIncome - w4.deductions
    - (w4.step2 ? 0 : w4.filingStatus === "married_jointly" ? 12_900 : 8_600);
  const wage = Math.max(0, annual);
  const table = (w4.step2 ? STEP2 : STANDARD)[w4.filingStatus];
  const [from, base, rate] = [...table].reverse().find(([a]) => wage >= a)!;
  const perPeriod = (base + (wage - from) * rate) / periods;
  return r2(Math.max(0, perPeriod - w4.dependents / periods) + w4.extraWithholding);
}

export type PayInput = {
  gross: number;
  periods: number;
  w4: W4;
  /** Pre-tax 401(k), as a percent of gross. Still taxed for Social Security and Medicare. */
  retirementPercent?: number;
  /** Pre-tax health premium this period (section 125): not taxed at all. */
  health?: number;
  /** Flat state income tax, as a percent of taxable wages. */
  stateRatePercent?: number;
  /** Social Security / Medicare wages already paid this calendar year, before this period. */
  ytdFicaWages?: number;
};

export type PayLine = {
  gross: number; retirement: number; health: number;
  federal_tax: number; social_security: number; medicare: number; state_tax: number; net: number;
  employer_social_security: number; employer_medicare: number; futa: number;
};

export function payLine(i: PayInput): PayLine {
  const gross = r2(Math.max(0, i.gross));
  const retirement = r2(gross * (i.retirementPercent ?? 0) / 100);
  const health = r2(Math.min(i.health ?? 0, gross - retirement));
  const fica = gross - health;
  const taxable = gross - retirement - health;
  const ytd = i.ytdFicaWages ?? 0;

  const ssWages = Math.max(0, Math.min(fica, SS_WAGE_BASE - ytd));
  const social_security = r2(ssWages * SS_RATE);
  const overAdditional = Math.max(0, ytd + fica - ADDITIONAL_MEDICARE_OVER) - Math.max(0, ytd - ADDITIONAL_MEDICARE_OVER);
  const medicare = r2(fica * MEDICARE_RATE + overAdditional * ADDITIONAL_MEDICARE_RATE);
  const state_tax = r2(taxable * (i.stateRatePercent ?? 0) / 100);
  // Never withhold more than is left of the pay.
  const room = r2(taxable - social_security - medicare - state_tax);
  const federal_tax = Math.max(0, Math.min(federalWithholding(taxable, i.periods, i.w4), room));

  return {
    gross, retirement, health, federal_tax, social_security, medicare, state_tax,
    net: r2(gross - retirement - health - federal_tax - social_security - medicare - state_tax),
    employer_social_security: social_security,
    employer_medicare: r2(fica * MEDICARE_RATE),
    futa: r2(Math.max(0, Math.min(fica, FUTA_WAGE_BASE - ytd)) * FUTA_RATE),
  };
}

/** Gross pay for a period: salary split over the year, or hourly rate times hours. */
export function grossPay(p: { base_salary?: number | null; hourly_rate?: number | null }, periods: number, hours: number) {
  if (p.base_salary) return r2(p.base_salary / periods);
  return r2((p.hourly_rate ?? 0) * hours);
}
