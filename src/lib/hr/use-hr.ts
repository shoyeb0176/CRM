import { useCurrentMembership } from "@/lib/use-current-org";
import { useOrgRole } from "@/lib/crm/use-org";

export function useOrgId(): string | undefined {
  return useCurrentMembership().membership?.org_id;
}

export { useOrgRole };

const HR_ROLES = new Set(["org_owner", "org_admin", "hr_manager"]);

export function useHrAccess(): boolean {
  const role = useOrgRole();
  return !!role && HR_ROLES.has(role);
}

export function fmtMoney(n: number | null | undefined, ccy = "USD") {
  if (n == null) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: ccy }).format(Number(n));
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

export function fullName(e: { first_name?: string | null; last_name?: string | null; preferred_name?: string | null }): string {
  if (!e) return "—";
  if (e.preferred_name) return e.preferred_name;
  return [e.first_name, e.last_name].filter(Boolean).join(" ") || "—";
}
