import { useMyMemberships } from "@/lib/use-memberships";
import { getSessionUser } from "@/lib/use-current-user";
import { useCurrentMembership } from "@/lib/use-current-org";

export function useAdminContext() {
  const me = useMyMemberships();
  const { membership } = useCurrentMembership();
  const orgId = membership?.org_id ?? null;
  const role = membership?.role;
  const isOwner = role === "org_owner" || role === "platform_owner";
  const isAdmin = isOwner || role === "org_admin";
  return { me, membership, orgId, role, isOwner, isAdmin };
}

export const ROLE_LABELS: Record<string, string> = {
  org_owner: "Owner",
  org_admin: "Admin",
  manager: "Manager",
  staff: "Staff",
  accountant: "Accountant",
  sales_rep: "Sales Rep",
  inventory_manager: "Inventory Manager",
  hr_manager: "HR Manager",
  read_only: "Read-only",
  platform_owner: "Platform Owner",
};

export { MODULES, ROLE_MATRIX, type ModuleKey } from "./role-matrix";
import type { Access } from "./role-matrix";

export const ACCESS_COLOR: Record<Access, string> = {
  full:  "bg-primary text-primary-foreground",
  write: "bg-foreground/80 text-background",
  read:  "bg-muted text-foreground",
  none:  "bg-background text-muted-foreground border border-border",
};

export function logAudit(params: {
  orgId: string;
  action: string;
  entityType?: string;
  entityId?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
}) {
  // Fire-and-forget audit logging
  import("@/integrations/supabase/client").then(async ({ supabase }) => {
    const { data: u } = await getSessionUser();
    await supabase.from("audit_logs").insert({
      org_id: params.orgId,
      user_id: u.user?.id ?? null,
      action: params.action,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      old_values: (params.oldValues ?? null) as never,
      new_values: (params.newValues ?? null) as never,
    });
  });
}
