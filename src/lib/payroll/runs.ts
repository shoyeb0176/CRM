// Builds pay run lines from each employee's payroll profile and their pay so far this year. Used on
// the server (payroll.functions.ts) with the signed-in person's own database access; the database
// checks every line adds up and locks the lines once the run is approved.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { BadgeTone } from "@/components/crm/status-badge";
import { DEFAULT_HOURS, PERIODS, grossPay, payLine, type FilingStatus, type PayFrequency } from "./us";

type Profile = Database["public"]["Tables"]["payroll_profiles"]["Row"];
export type PayRun = Database["public"]["Tables"]["pay_runs"]["Row"];
export type PayRunLine = Database["public"]["Tables"]["pay_run_lines"]["Row"];
export type PayContext = { profile: Profile; name: string; ytdFicaWages: number };

export const FREQUENCIES: { value: PayFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" }, { value: "biweekly", label: "Every two weeks" },
  { value: "semimonthly", label: "Twice a month" }, { value: "monthly", label: "Monthly" },
];
export const RUN_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  approved: { label: "Approved", tone: "primary" },
  paid: { label: "Paid", tone: "success" },
};
export const FILING_STATUSES: { value: FilingStatus; label: string }[] = [
  { value: "single", label: "Single or married filing separately" },
  { value: "married_jointly", label: "Married filing jointly" },
  { value: "head_of_household", label: "Head of household" },
];

/**
 * Active employees with a payroll profile, and the Social Security / Medicare wages each was paid
 * this calendar year in approved or paid runs dated before `payDate`.
 */
export async function payContexts(supabase: SupabaseClient<Database>, orgId: string, payDate: string, excludeRun?: string) {
  const year = payDate.slice(0, 4);
  const [profiles, past] = await Promise.all([
    supabase.from("payroll_profiles")
      .select("*, employee:employees!inner(first_name, last_name, preferred_name, status)")
      .eq("org_id", orgId).eq("employee.status", "active"),
    supabase.from("pay_run_lines")
      .select("employee_id, gross, health, pay_run_id, run:pay_runs!inner(status, pay_date)")
      .eq("org_id", orgId).in("run.status", ["approved", "paid"])
      .gte("run.pay_date", `${year}-01-01`).lt("run.pay_date", payDate),
  ]);
  if (profiles.error) throw profiles.error;
  if (past.error) throw past.error;
  const ytd = new Map<string, number>();
  for (const l of past.data ?? []) {
    if (l.pay_run_id === excludeRun) continue;
    ytd.set(l.employee_id, (ytd.get(l.employee_id) ?? 0) + Number(l.gross) - Number(l.health));
  }
  return new Map((profiles.data ?? []).map((p) => {
    const e = p.employee as { first_name: string; last_name: string; preferred_name: string | null };
    return [p.employee_id, { profile: p, name: `${e.preferred_name || e.first_name} ${e.last_name}`, ytdFicaWages: ytd.get(p.employee_id) ?? 0 }];
  }));
}

/** One employee's line. Hourly staff get the usual hours for the period unless `hours` is given. */
export function lineFor(ctx: PayContext, frequency: PayFrequency, change: { hours?: number | null; gross?: number } = {}) {
  const p = ctx.profile;
  const periods = PERIODS[frequency];
  const hours = p.base_salary ? null : change.hours ?? DEFAULT_HOURS[frequency];
  const gross = change.gross ?? grossPay({ base_salary: Number(p.base_salary) || null, hourly_rate: Number(p.hourly_rate) || null }, periods, hours ?? 0);
  return {
    hours,
    ...payLine({
      gross, periods, ytdFicaWages: ctx.ytdFicaWages,
      retirementPercent: Number(p.retirement_percent), health: Number(p.health_deduction), stateRatePercent: Number(p.state_tax_rate),
      w4: {
        filingStatus: p.filing_status as FilingStatus, step2: p.w4_step2, dependents: Number(p.w4_dependents),
        otherIncome: Number(p.w4_other_income), deductions: Number(p.w4_deductions), extraWithholding: Number(p.w4_extra_withholding),
      },
    }),
  };
}

/** Employee taxes on a line. */
export const employeeTaxes = (l: Pick<PayRunLine, "federal_tax" | "social_security" | "medicare" | "state_tax">) =>
  Number(l.federal_tax) + Number(l.social_security) + Number(l.medicare) + Number(l.state_tax);
/** Employer taxes on a line. */
export const employerTaxes = (l: Pick<PayRunLine, "employer_social_security" | "employer_medicare" | "futa">) =>
  Number(l.employer_social_security) + Number(l.employer_medicare) + Number(l.futa);
