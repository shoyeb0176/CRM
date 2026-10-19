// Static registry of tools that AI agents can be granted.
// This catalog seeds the "Tools" tab and the Create-Agent wizard.
// Real execution lives in agent-service.functions.ts (server-side).

export type ToolCategory = "internal" | "external";

export type ToolDef = {
  name: string;            // canonical tool key
  label: string;           // human label
  description: string;
  /** Sample arguments, shown to the AI only (not in the Tools tab). */
  example?: string;
  category: ToolCategory;
  toolType:
    | "internal_erp_action"
    | "external_api"
    | "webhook"
    | "email"
    | "database_query"
    | "file_reader"
    | "report_generator"
    | "notification"
    | "http_request"
    | "custom_function"
    | "mcp_server_placeholder";
  requiredPermissions: { module: string; action: "read" | "create" | "update" | "delete" | "execute" }[];
  requiresApproval: boolean;
  readOnly: boolean;
  externalAccess: boolean;
  inputSchema?: Record<string, string>;  // placeholder
  outputSchema?: Record<string, string>; // placeholder
};

/** What the AI reads about a tool: the description plus its example call. */
export const toolDescription = (t: Pick<ToolDef, "description" | "example">) =>
  t.example ? `${t.description} Example arguments: ${t.example}` : t.description;

/** Writes (or anything flagged for approval) only run after a person approves them. */
export const isWriteTool = (t: Pick<ToolDef, "readOnly" | "requiresApproval">) => !t.readOnly || t.requiresApproval;

export const TOOL_REGISTRY: ToolDef[] = [
  // ---------------- Internal ERP tools ----------------
  { name: "crm_search_contacts", label: "Search contacts", description: "Find people by name, email or company name. Use it before creating a contact or note to get the contact_id.", example: "{\"query\": \"Acme\"}", category: "internal", toolType: "database_query",
    requiredPermissions: [{ module: "crm", action: "read" }], requiresApproval: false, readOnly: true, externalAccess: false,
    inputSchema: { query: "string" }, outputSchema: { contacts: "Contact[]" } },
  { name: "crm_create_lead", label: "Create lead", description: "Add a new enquiry that is not yet qualified. Only name is required.", example: "{\"name\": \"Dana Lee\", \"company_name\": \"Acme\", \"estimated_value\": 5000}", category: "internal", toolType: "internal_erp_action",
    requiredPermissions: [{ module: "crm", action: "create" }], requiresApproval: true, readOnly: false, externalAccess: false,
    inputSchema: { name: "string", email: "string?", phone: "string?", company_name: "string?", job_title: "string?", estimated_value: "number?", notes: "string?" } },
  { name: "crm_list_leads", label: "List leads", description: "List leads, newest first; filter by part of a name or email, or by status.", example: "{\"status\": \"new\"}", category: "internal", toolType: "database_query",
    requiredPermissions: [{ module: "crm", action: "read" }], requiresApproval: false, readOnly: true, externalAccess: false,
    inputSchema: { query: "string?", status: "new|contacted|qualified|unqualified|converted?" } },
  { name: "crm_list_deals", label: "List deals", description: "Deals in the pipeline with their stage, amount and close date, plus how many match and their total value. Filter by status (default open) or part of the title.", example: "{\"status\": \"open\"}", category: "internal", toolType: "database_query",
    requiredPermissions: [{ module: "crm", action: "read" }], requiresApproval: false, readOnly: true, externalAccess: false,
    inputSchema: { query: "string?", status: "open|won|lost|all?" } },
  { name: "crm_create_company", label: "Create company", description: "Add a customer or prospect company. Search first so you don't create a duplicate.", example: "{\"name\": \"Acme Ltd\", \"country\": \"UK\"}", category: "internal", toolType: "internal_erp_action",
    requiredPermissions: [{ module: "crm", action: "create" }], requiresApproval: true, readOnly: false, externalAccess: false,
    inputSchema: { name: "string", industry: "string?", website: "string?", phone: "string?", city: "string?", country: "string?", address: "string?" } },
  { name: "crm_create_contact", label: "Create contact", description: "Add a person, linked to a company by company_id or by the exact name of an existing company.", example: "{\"first_name\": \"Dana\", \"last_name\": \"Lee\", \"company_name\": \"Acme Ltd\"}", category: "internal", toolType: "internal_erp_action",
    requiredPermissions: [{ module: "crm", action: "create" }], requiresApproval: true, readOnly: false, externalAccess: false,
    inputSchema: { first_name: "string", last_name: "string?", email: "string?", phone: "string?", job_title: "string?", company_id: "uuid?", company_name: "string?" } },
  { name: "crm_update_deal", label: "Update deal", description: "Change a deal's stage, amount, win probability or status. Needs the deal_id (and a stage_id from the pipeline to move it).", example: "{\"deal_id\": \"…\", \"status\": \"won\"}", category: "internal", toolType: "internal_erp_action",
    requiredPermissions: [{ module: "crm", action: "update" }], requiresApproval: true, readOnly: false, externalAccess: false,
    inputSchema: { deal_id: "uuid", stage_id: "uuid?", amount: "number?", probability: "number? (0-100)", status: "open|won|lost?" } },
  { name: "crm_add_note", label: "Add activity note", description: "Log a note, call, email or meeting on a deal, contact, company or lead (give one of their ids).", example: "{\"contact_id\": \"…\", \"type\": \"call\", \"note\": \"Asked for a quote by Friday\"}", category: "internal", toolType: "internal_erp_action",
    requiredPermissions: [{ module: "crm", action: "create" }], requiresApproval: false, readOnly: false, externalAccess: false,
    inputSchema: { note: "string", type: "note|call|email|meeting|task|follow_up?", subject: "string?", deal_id: "uuid?", contact_id: "uuid?", company_id: "uuid?", lead_id: "uuid?" } },
  { name: "invoice_search", label: "Search invoices", description: "Find invoices by status or customer company.", example: "{\"status\": \"overdue\"}", category: "internal", toolType: "database_query",
    requiredPermissions: [{ module: "invoices", action: "read" }], requiresApproval: false, readOnly: true, externalAccess: false,
    inputSchema: { status: "draft|sent|partially_paid|paid|overdue|void?", company_id: "uuid?" } },
  { name: "invoice_create_draft", label: "Create draft invoice", description: "Create a draft invoice for a customer, optionally with lines. It stays a draft until someone sends it.", example: "{\"company_id\": \"…\", \"due_date\": \"2026-11-30\", \"items\": \"[{\\\"description\\\": \\\"Consulting\\\", \\\"quantity\\\": 10, \\\"unit_price\\\": 120}]\"}", category: "internal", toolType: "internal_erp_action",
    requiredPermissions: [{ module: "invoices", action: "create" }], requiresApproval: true, readOnly: false, externalAccess: false,
    inputSchema: { company_id: "uuid?", contact_id: "uuid?", currency: "string? (e.g. USD)", issue_date: "YYYY-MM-DD?", due_date: "YYYY-MM-DD?", notes: "string?", items: "string? (JSON list of lines: description, quantity, unit_price, tax_rate, product_id)" } },
  { name: "invoice_mark_sent", label: "Send invoice", description: "Mark a draft invoice as sent. Use invoice_search first to get its id.", example: "{\"invoice_id\": \"…\"}", category: "internal", toolType: "internal_erp_action",
    requiredPermissions: [{ module: "invoices", action: "update" }], requiresApproval: true, readOnly: false, externalAccess: false,
    inputSchema: { invoice_id: "uuid" } },
  { name: "payment_record", label: "Record payment", description: "Record a customer payment against an unpaid invoice; the amount can be part of the balance.", example: "{\"invoice_id\": \"…\", \"amount\": 250, \"reference\": \"Bank transfer 1182\"}", category: "internal", toolType: "internal_erp_action",
    requiredPermissions: [{ module: "payments", action: "create" }], requiresApproval: true, readOnly: false, externalAccess: false,
    inputSchema: { invoice_id: "uuid", amount: "number", payment_date: "YYYY-MM-DD?", reference: "string?", notes: "string?" } },
  { name: "inventory_check_stock", label: "Check stock", description: "Current on-hand stock, per product and warehouse, with the low-stock threshold. Leave both ids out for everything (first 50 rows).", example: "{\"product_id\": \"…\"}", category: "internal", toolType: "database_query",
    requiredPermissions: [{ module: "inventory", action: "read" }], requiresApproval: false, readOnly: true, externalAccess: false,
    inputSchema: { product_id: "uuid?", warehouse_id: "uuid?" } },
  { name: "inventory_create_adjustment_request", label: "Propose stock adjustment", description: "Propose a stock correction (positive adds, negative removes) for a product in a warehouse.", example: "{\"product_id\": \"…\", \"warehouse_id\": \"…\", \"quantity_delta\": -3, \"reason\": \"Damaged in transit\"}", category: "internal", toolType: "internal_erp_action",
    requiredPermissions: [{ module: "inventory", action: "create" }], requiresApproval: true, readOnly: false, externalAccess: false,
    inputSchema: { product_id: "uuid", warehouse_id: "uuid", quantity_delta: "number (+ or -)", reason: "string?", notes: "string?" } },
  { name: "project_summarize_status", label: "Summarize project", description: "A project's health: tasks by status, overdue tasks, hours and budget. By id or name.", example: "{\"project_name\": \"Website relaunch\"}", category: "internal", toolType: "report_generator",
    requiredPermissions: [{ module: "projects", action: "read" }], requiresApproval: false, readOnly: true, externalAccess: false,
    inputSchema: { project_id: "uuid?", project_name: "string?" } },
  { name: "task_create", label: "Create task", description: "Create a task in an existing project (by project_id or exact project_name). Ask which project if the user didn't say.", example: "{\"title\": \"Send proposal\", \"project_name\": \"Acme rollout\", \"due_date\": \"2026-11-02\"}", category: "internal", toolType: "internal_erp_action",
    requiredPermissions: [{ module: "projects", action: "create" }], requiresApproval: true, readOnly: false, externalAccess: false,
    inputSchema: { title: "string", project_id: "uuid?", project_name: "string?", description: "string?", due_date: "YYYY-MM-DD?", priority: "low|medium|high|urgent?" } },
  { name: "task_update", label: "Update task", description: "Change a task's status, due date, assignee or priority.", example: "{\"task_id\": \"…\", \"status\": \"done\"}", category: "internal", toolType: "internal_erp_action",
    requiredPermissions: [{ module: "projects", action: "update" }], requiresApproval: false, readOnly: false, externalAccess: false,
    inputSchema: { task_id: "uuid", status: "todo|in_progress|review|done|blocked|cancelled?", due_date: "YYYY-MM-DD?", assignee_id: "uuid?", priority: "low|medium|high|urgent?" } },
  { name: "hr_search_employee_limited", label: "Search HR (limited)", description: "Look up employees by name or email, with their department and job title but no pay details.", example: "{\"query\": \"designer\"}", category: "internal", toolType: "database_query",
    requiredPermissions: [{ module: "hr", action: "read" }], requiresApproval: true, readOnly: true, externalAccess: false,
    inputSchema: { query: "string?" } },
  { name: "report_generate_sales_summary", label: "Sales summary report", description: "Sales by month (invoiced and paid), quotes by status, the open pipeline by stage and top customers. No arguments.", category: "internal", toolType: "report_generator",
    requiredPermissions: [{ module: "reports", action: "read" }], requiresApproval: false, readOnly: true, externalAccess: false },
  { name: "report_generate_cashflow_summary", label: "Cashflow summary", description: "Cash in and out by month, money owed to you (and how much is overdue) and unpaid bills. No arguments.", category: "internal", toolType: "report_generator",
    requiredPermissions: [{ module: "reports", action: "read" }], requiresApproval: false, readOnly: true, externalAccess: false },
  { name: "notification_create", label: "Notify a user", description: "Send an in-app notification to one team member (user_id) or everyone.", example: "{\"title\": \"Stock count due\", \"body\": \"Please count warehouse B by Friday\"}", category: "internal", toolType: "notification",
    requiredPermissions: [{ module: "settings", action: "create" }], requiresApproval: false, readOnly: false, externalAccess: false,
    inputSchema: { title: "string", body: "string?", user_id: "uuid? (one member; leave out to tell everyone)", link: "string?" } },

  { name: "quote_search", label: "Find quotes", description: "Quotes, newest first, with number, customer, status, total and expiry; filter by status (draft, sent, accepted, rejected, expired, converted) or customer name.", example: "{\"status\": \"sent\"}", category: "internal", toolType: "database_query",
    requiredPermissions: [{ module: "sales", action: "read" }], requiresApproval: false, readOnly: true, externalAccess: false,
    inputSchema: { status: "string?", customer: "string?" } },
  { name: "payment_list", label: "List payments", description: "Payments received in the last N days (default 30) with the invoice, amount and date, and their total.", example: "{\"days\": 30}", category: "internal", toolType: "database_query",
    requiredPermissions: [{ module: "payments", action: "read" }], requiresApproval: false, readOnly: true, externalAccess: false,
    inputSchema: { days: "number?" } },
  { name: "project_list", label: "List projects", description: "Projects with status, customer, due date and budget; filter by status (planned, active, on_hold, completed) or part of the name.", example: "{\"status\": \"active\"}", category: "internal", toolType: "database_query",
    requiredPermissions: [{ module: "projects", action: "read" }], requiresApproval: false, readOnly: true, externalAccess: false,
    inputSchema: { status: "string?", query: "string?" } },
  { name: "send_email", label: "Send email", description: "Email one person from the company mailbox (Settings › Email), e.g. a payment reminder or a follow-up. Always waits for approval.", example: "{\"to\": \"ana@acme.example\", \"subject\": \"Invoice INV-0042\", \"body\": \"Hi Ana, …\"}", category: "external", toolType: "email",
    requiredPermissions: [{ module: "crm", action: "read" }], requiresApproval: true, readOnly: false, externalAccess: true,
    inputSchema: { to: "email", subject: "string", body: "string (plain text)" } },
  { name: "team_chat_post", label: "Post to team chat", description: "Post a message to the workspace's Slack or Microsoft Teams channels (Communications › Channels).", example: "{\"title\": \"3 invoices overdue\", \"body\": \"INV-12, INV-15, INV-19\"}", category: "external", toolType: "webhook",
    requiredPermissions: [], requiresApproval: true, readOnly: false, externalAccess: true,
    inputSchema: { title: "string", body: "string?", link: "string?" } },

  // ---------------- External tools (placeholders) ----------------
  { name: "send_email_placeholder", label: "Send email", description: "Send a customer-facing email via a configured provider.", category: "external", toolType: "email",
    requiredPermissions: [], requiresApproval: true, readOnly: false, externalAccess: true },
  { name: "call_webhook_placeholder", label: "Call webhook", description: "POST a payload to an external webhook URL.", category: "external", toolType: "webhook",
    requiredPermissions: [], requiresApproval: true, readOnly: false, externalAccess: true },
  { name: "http_request_placeholder", label: "HTTP request", description: "Make an outbound HTTP request to a configured endpoint.", category: "external", toolType: "http_request",
    requiredPermissions: [], requiresApproval: true, readOnly: false, externalAccess: true },
  { name: "external_api_lookup_placeholder", label: "External API lookup", description: "Read-only lookup against a configured external API.", category: "external", toolType: "external_api",
    requiredPermissions: [], requiresApproval: false, readOnly: true, externalAccess: true },
  { name: "calendar_event_create_placeholder", label: "Create calendar event", description: "Create a calendar event on a connected calendar.", category: "external", toolType: "external_api",
    requiredPermissions: [], requiresApproval: true, readOnly: false, externalAccess: true },
  { name: "slack_message_placeholder", label: "Slack message", description: "Post a message to a connected Slack channel.", category: "external", toolType: "external_api",
    requiredPermissions: [], requiresApproval: true, readOnly: false, externalAccess: true },
  { name: "mcp_tool_call_placeholder", label: "MCP tool call", description: "Invoke a tool on a connected MCP server.", category: "external", toolType: "mcp_server_placeholder",
    requiredPermissions: [], requiresApproval: true, readOnly: false, externalAccess: true },
];

export const MODULE_KEYS = [
  "crm","sales","invoices","payments","inventory","purchasing","accounting",
  "projects","hr","reports","settings","customer_portal",
] as const;
export type ModuleKey = typeof MODULE_KEYS[number];
/** How each module is named on screen. */
export const MODULE_LABELS: Record<string, string> = {
  crm: "CRM", sales: "Sales", invoices: "Invoices", payments: "Payments", inventory: "Inventory", purchasing: "Purchasing",
  accounting: "Accounting", projects: "Projects", hr: "HR", reports: "Reports", settings: "Settings", customer_portal: "Customer portal",
};

export const EXTERNAL_PROVIDERS = [
  { provider: "OpenAI",            note: "GPT models for chat completions and embeddings." },
  { provider: "Anthropic",         note: "Claude family models." },
  { provider: "Google Gemini",     note: "Gemini multimodal models." },
  { provider: "Slack",             note: "Post messages and respond to events." },
  { provider: "Gmail",             note: "Send and read mail via OAuth." },
  { provider: "Google Calendar",   note: "Create and read events." },
  { provider: "HubSpot",           note: "Sync contacts, deals, and engagements." },
  { provider: "Stripe",            note: "Customers, invoices, and payment intents." },
  { provider: "QuickBooks",        note: "Sync accounting and tax records." },
  { provider: "Zapier",            note: "Trigger Zapier workflows via webhooks." },
  { provider: "Make",              note: "Trigger Make scenarios via webhooks." },
  { provider: "Custom REST API",   note: "Any HTTPS endpoint with header auth." },
  { provider: "Custom Webhook",    note: "Outbound webhook to any URL." },
  { provider: "MCP Server",        note: "Connect a Model Context Protocol server." },
] as const;
