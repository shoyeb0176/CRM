// Startup (the free plan) is for businesses with 15 or fewer employees OR under $100,000 a year in
// revenue (pricing, 16 Oct 2026). A business over both should be on a paid plan.
export const EMPLOYEE_BANDS = [
  { value: "1-15", label: "1 to 15" }, { value: "16-50", label: "16 to 50" },
  { value: "51-200", label: "51 to 200" }, { value: "201+", label: "More than 200" },
] as const;
export const REVENUE_BANDS = [
  { value: "under-100k", label: "Under $100,000" }, { value: "100k-1m", label: "$100,000 to $1 million" },
  { value: "1m-10m", label: "$1 to $10 million" }, { value: "over-10m", label: "Over $10 million" },
] as const;

/** null until both questions are answered. */
export function startupEligible(employeeBand: string | null | undefined, revenueBand: string | null | undefined): boolean | null {
  if (!employeeBand || !revenueBand) return null;
  return employeeBand === "1-15" || revenueBand === "under-100k";
}
