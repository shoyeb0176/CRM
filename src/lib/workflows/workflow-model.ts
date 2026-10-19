export type WorkflowEntity = "invoice" | "deal" | "lead" | "task" | "company" | "contact";

export const ENTITY_TABLE: Record<WorkflowEntity, string> = {
  invoice: "invoices",
  deal: "deals",
  lead: "leads",
  task: "project_tasks",
  company: "companies",
  contact: "contacts",
};

export const ENTITY_LABEL: Record<WorkflowEntity, string> = {
  invoice: "Invoices",
  deal: "Deals",
  lead: "Leads",
  task: "Tasks",
  company: "Companies",
  contact: "Contacts",
};

export const ENTITY_TITLE_FIELD: Record<WorkflowEntity, string> = {
  invoice: "number",
  deal: "title",
  lead: "name",
  task: "title",
  company: "name",
  contact: "first_name",
};

export const ENTITY_LINK: Record<WorkflowEntity, (id: string) => string> = {
  invoice: (id) => `/app/invoices/${id}`,
  deal: () => `/app/crm/deals`,
  lead: () => `/app/crm/leads`,
  task: () => `/app/projects`,
  company: (id) => `/app/crm/companies/${id}`,
  contact: (id) => `/app/crm/contacts/${id}`,
};

export const ENTITY_FIELDS: Record<WorkflowEntity, string[]> = {
  invoice: ["status", "balance_due", "total", "due_date", "currency", "number"],
  deal: ["status", "amount", "stage_id", "expected_close_date", "title", "updated_at"],
  lead: ["status", "source", "estimated_value", "name", "email", "created_at"],
  task: ["status", "priority", "due_date", "title", "assignee_id"],
  company: ["lifecycle_stage", "industry", "name", "website", "created_at"],
  contact: ["lifecycle_stage", "email", "first_name", "last_name", "created_at"],
};

export type ConditionOp = "eq" | "neq" | "gt" | "lt" | "contains" | "is_empty" | "not_empty" | "older_than_days";

export const OP_LABEL: Record<ConditionOp, string> = {
  eq: "is",
  neq: "is not",
  gt: "greater than",
  lt: "less than",
  contains: "contains",
  is_empty: "is empty",
  not_empty: "is not empty",
  older_than_days: "older than (days)",
};

export type WorkflowCondition = { field: string; op: ConditionOp; value: string };

export type WorkflowActionType = "notify" | "create_task" | "log_activity" | "webhook";

export const ACTION_LABEL: Record<WorkflowActionType, string> = {
  notify: "Send a notification",
  create_task: "Create a task",
  log_activity: "Log an activity",
  webhook: "Call a webhook",
};

export type WorkflowAction = {
  type: WorkflowActionType;
  title?: string;
  body?: string;
  severity?: "info" | "success" | "warning" | "error";
  url?: string;
};

export type TriggerKind = "manual" | "schedule";

export type WorkflowRow = {
  id: string;
  name: string;
  description: string | null;
  entity: WorkflowEntity;
  trigger_kind: TriggerKind;
  trigger_config: Record<string, unknown>;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  is_active: boolean;
  last_run_at: string | null;
};

export const WORKFLOW_TEMPLATES: Array<{
  id: string;
  label: string;
  description: string;
  entity: WorkflowEntity;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
}> = [
  {
    id: "blank",
    label: "Blank workflow",
    description: "Start from scratch.",
    entity: "invoice",
    conditions: [],
    actions: [],
  },
  {
    id: "overdue-invoice",
    label: "Chase overdue invoices",
    description: "Notify when an invoice is past due with a balance.",
    entity: "invoice",
    conditions: [
      { field: "balance_due", op: "gt", value: "0" },
      { field: "due_date", op: "older_than_days", value: "0" },
    ],
    actions: [{ type: "notify", title: "Invoice overdue", body: "This invoice is past its due date.", severity: "warning" }],
  },
  {
    id: "stale-deal",
    label: "Wake up stale deals",
    description: "Create a follow-up task for deals untouched for 14 days.",
    entity: "deal",
    conditions: [{ field: "updated_at", op: "older_than_days", value: "14" }],
    actions: [{ type: "create_task", title: "Follow up on stale deal" }],
  },
  {
    id: "new-lead",
    label: "Welcome new leads",
    description: "Log an activity for every new, uncontacted lead.",
    entity: "lead",
    conditions: [{ field: "status", op: "eq", value: "new" }],
    actions: [{ type: "log_activity", title: "New lead to qualify", body: "Reach out within 24 hours." }],
  },
];
