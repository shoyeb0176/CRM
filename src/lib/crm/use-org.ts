import { useCurrentMembership } from "@/lib/use-current-org";

/** Current org id from the selected workspace. Drives RLS scoping. */
export function useOrgId(): string | undefined {
  return useCurrentMembership().membership?.org_id;
}

/** The platform owner runs their own workspace as its owner (same rule as has_org_role in the database). */
export function useOrgRole() {
  const role = useCurrentMembership().membership?.role;
  return role === "platform_owner" ? "org_owner" : role;
}
