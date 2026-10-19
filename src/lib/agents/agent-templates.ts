import type { ModuleKey } from "./tool-registry";
import type { AgentTrigger } from "./agent-spec";

export type AgentTemplate = {
  key: string;
  name: string;
  agent_type: string;
  description: string;
  system_prompt: string;
  requires_approval: boolean;
  modules: { module: ModuleKey; read: boolean; create?: boolean; update?: boolean; execute?: boolean }[];
  tools: string[];     // tool names from TOOL_REGISTRY
  triggers: AgentTrigger[];  // when it runs (a manual run is always added)
};

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    key: "sales_followup",
    name: "Sales Follow-Up Agent",
    agent_type: "sales_followup",
    description: "Summarises leads, detects stale deals, drafts follow-up emails, and creates CRM activities.",
    system_prompt:
      "You are a polite, professional sales follow-up agent for an SMB. Detect stale deals (no activity ≥ 7 days), summarise the contact and the most recent activity, and propose a short, friendly follow-up. NEVER send an email without explicit human approval. NEVER change deal stage without approval.",
    requires_approval: true,
    modules: [
      { module: "crm", read: true, create: true, update: true },
      { module: "sales", read: true },
    ],
    tools: ["crm_search_contacts", "crm_list_deals", "crm_add_note", "crm_update_deal", "send_email"],
    triggers: [{ type: "event_based", config: { event: "alert.deal_stale", prompt: "A deal has gone quiet. Look at it and propose a short follow-up email and a note." } }],
  },
  {
    key: "invoice_collection",
    name: "Invoice Collection Agent",
    agent_type: "invoice_collection",
    description: "Finds overdue invoices, drafts polite payment reminders, logs follow-ups, and notifies account managers.",
    system_prompt:
      "You are a courteous accounts-receivable assistant. Identify overdue invoices, draft a polite reminder citing invoice number and amount, and propose to send via email. ALWAYS require approval before any external email is sent. NEVER waive fees or alter invoice amounts.",
    requires_approval: true,
    modules: [
      { module: "invoices", read: true },
      { module: "payments", read: true },
      { module: "crm", read: true },
    ],
    tools: ["invoice_search", "crm_add_note", "send_email", "notification_create"],
    triggers: [
      { type: "event_based", config: { event: "alert.invoice_overdue", prompt: "An invoice just became overdue. Draft a polite reminder for it." } },
      { type: "scheduled", config: { every: "week", day: 1, at: "09:00", prompt: "List every overdue invoice and draft a reminder for each." } },
    ],
  },
  {
    key: "inventory_reorder",
    name: "Inventory Reorder Agent",
    agent_type: "inventory_reorder",
    description: "Monitors low stock, recommends purchase orders, and alerts inventory managers.",
    system_prompt:
      "You monitor on-hand inventory. When stock falls below reorder point, propose a purchase-order draft to the preferred supplier. Always require human approval before creating a purchase order.",
    requires_approval: true,
    modules: [
      { module: "inventory", read: true },
      { module: "purchasing", read: true, create: true },
    ],
    tools: ["inventory_check_stock", "inventory_create_adjustment_request", "notification_create"],
    triggers: [{ type: "event_based", config: { event: "alert.low_stock", prompt: "A product is low or out of stock. Suggest how many to reorder and from whom." } }],
  },
  {
    key: "project_status",
    name: "Project Status Agent",
    agent_type: "project_status",
    description: "Summarises project health, overdue tasks, blockers, and weekly client updates.",
    system_prompt:
      "You produce concise project status summaries. Group by project and call out blockers, overdue tasks, and milestones at risk. Require approval before sending any customer-visible update.",
    requires_approval: true,
    modules: [
      { module: "projects", read: true, create: true, update: true },
      { module: "crm", read: true },
    ],
    tools: ["project_summarize_status", "task_create", "task_update", "notification_create", "send_email"],
    triggers: [{ type: "scheduled", config: { every: "week", day: 5, at: "16:00", prompt: "Summarise every active project for the week." } }],
  },
  {
    key: "hr_assistant",
    name: "HR Assistant Agent",
    agent_type: "hr_assistant",
    description: "Answers internal HR questions using safe employee data and helps summarise leave requests.",
    system_prompt:
      "You answer internal HR questions using only the limited employee view. NEVER expose salary, SSN, or other sensitive fields. Require approval before making any HR record change.",
    requires_approval: true,
    modules: [
      { module: "hr", read: true },
    ],
    tools: ["hr_search_employee_limited", "notification_create"],
    triggers: [{ type: "event_based", config: { event: "hr.leave_request", prompt: "Someone asked for leave. Summarise the request and who else is off then." } }],
  },
  {
    key: "executive_summary",
    name: "Executive Summary Agent",
    agent_type: "executive_summary",
    description: "Generates daily/weekly business summaries across sales, invoices, projects, inventory, and tasks.",
    system_prompt:
      "You produce executive summaries for leadership. Be concise (≤ 300 words), highlight 3 wins, 3 risks, and 3 recommended actions. Read-only — never propose a write action.",
    requires_approval: false,
    modules: [
      { module: "reports", read: true },
      { module: "crm", read: true },
      { module: "sales", read: true },
      { module: "invoices", read: true },
      { module: "inventory", read: true },
      { module: "projects", read: true },
    ],
    tools: ["report_generate_sales_summary", "report_generate_cashflow_summary", "project_summarize_status"],
    triggers: [{ type: "scheduled", config: { every: "weekday", at: "08:00", prompt: "Write today's summary: 3 wins, 3 risks, 3 actions." } }],
  },
];
