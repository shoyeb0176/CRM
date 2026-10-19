// What each role may do per module. Shared by the Roles page and server code (MCP tools).
export type ModuleKey =
  | "crm" | "sales" | "invoices" | "inventory" | "purchasing"
  | "accounting" | "projects" | "hr" | "reports" | "settings";

export const MODULES: { key: ModuleKey; label: string }[] = [
  { key: "crm", label: "CRM" },
  { key: "sales", label: "Sales" },
  { key: "invoices", label: "Invoices" },
  { key: "inventory", label: "Inventory" },
  { key: "purchasing", label: "Purchasing" },
  { key: "accounting", label: "Accounting" },
  { key: "projects", label: "Projects" },
  { key: "hr", label: "HR" },
  { key: "reports", label: "Reports" },
  { key: "settings", label: "Settings" },
];

export type Access = "full" | "write" | "read" | "none";

export const ROLE_MATRIX: Record<string, Record<ModuleKey, Access>> = {
  org_owner:         { crm:"full", sales:"full", invoices:"full", inventory:"full", purchasing:"full", accounting:"full", projects:"full", hr:"full", reports:"full", settings:"full" },
  org_admin:         { crm:"full", sales:"full", invoices:"full", inventory:"full", purchasing:"full", accounting:"full", projects:"full", hr:"full", reports:"full", settings:"full" },
  manager:           { crm:"write",sales:"write",invoices:"write",inventory:"write",purchasing:"write",accounting:"read",projects:"write",hr:"read",reports:"read",settings:"none" },
  staff:             { crm:"write",sales:"write",invoices:"read", inventory:"read", purchasing:"read", accounting:"none",projects:"write",hr:"none",reports:"read",settings:"none" },
  accountant:        { crm:"read", sales:"read", invoices:"write",inventory:"read", purchasing:"write",accounting:"full",projects:"read",hr:"none",reports:"read",settings:"none" },
  sales_rep:         { crm:"write",sales:"write",invoices:"write",inventory:"read", purchasing:"none", accounting:"none",projects:"read",hr:"none",reports:"read",settings:"none" },
  inventory_manager: { crm:"none", sales:"read", invoices:"read", inventory:"full", purchasing:"full", accounting:"none",projects:"read",hr:"none",reports:"read",settings:"none" },
  hr_manager:        { crm:"none", sales:"none", invoices:"none", inventory:"none", purchasing:"none", accounting:"none",projects:"read",hr:"full",reports:"read",settings:"none" },
  read_only:         { crm:"read", sales:"read", invoices:"read", inventory:"read", purchasing:"read", accounting:"read",projects:"read",hr:"none",reports:"read",settings:"none" },
};

/** A role's access to a module; platform_owner counts as owner in their own workspace. */
export function moduleAccess(role: string | null | undefined, module: ModuleKey): Access {
  const r = role === "platform_owner" ? "org_owner" : role ?? "";
  return ROLE_MATRIX[r]?.[module] ?? "none";
}
