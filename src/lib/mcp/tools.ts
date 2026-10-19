// Every tool the Inuberry MCP server offers. Reads filter by the connected workspace and check the
// caller's role; writes never run directly — they go through the same approval queue as the in-app
// assistant (proposeAction), so the workspace's AI action policy decides: wait for approval in
// Inuberry (default), run at once (autonomous) or refuse (read only).
import { z } from "zod";
import { ToolError } from "@lovable.dev/mcp-js";
import { defineDbTool, json, requireAccess, term, type McpAppContext } from "./context";
import type { ModuleKey } from "@/lib/settings/role-matrix";

// Links in answers point at this install (SITE_URL on self-hosted installs).
const site = () => (process.env.SITE_URL || "https://crm.inuberry.com").replace(/\/+$/, "");
const limit = z.number().int().min(1).max(100).optional().describe("Max results (default 25)");

/* ------------------------------- workspace ------------------------------- */

const listWorkspaces = defineDbTool({
  name: "list_workspaces",
  title: "Which workspace am I in?",
  description: "Show the Inuberry workspace this connection works in, your role there, and your other workspaces. To use another workspace, reconnect the app and pick it on the consent screen (or make a personal key for it).",
  handler: async (_args, ctx) => {
    const c = ctx.appContext;
    const { data } = await c.db.from("memberships").select("org_id, role, organizations:org_id(name, slug)")
      .eq("user_id", c.userId).eq("status", "active");
    return json({
      current: { org_id: c.orgId, role: c.role, connected_with: c.via === "key" ? "personal key" : "sign-in" },
      workspaces: (data ?? []).map((m) => ({ org_id: m.org_id, role: m.role, ...(m.organizations as object | null), current: m.org_id === c.orgId })),
    });
  },
});

/* ---------------------------------- CRM ---------------------------------- */

const searchCustomers = defineDbTool({
  name: "search_customers",
  title: "Search customers",
  description: "Search companies and contacts by keyword (name, email, phone, website). Use it to turn names into ids before other calls.",
  inputSchema: { query: z.string().min(1).describe("Keyword"), limit },
  handler: async ({ query, limit: max }, ctx) => {
    const c = ctx.appContext;
    requireAccess(c, "crm");
    const like = `%${term(query)}%`;
    const [companies, contacts] = await Promise.all([
      c.db.from("companies").select("id,name,industry,status,website,phone,city,country").eq("org_id", c.orgId)
        .or(`name.ilike.${like},website.ilike.${like},phone.ilike.${like}`).limit(max ?? 20),
      c.db.from("contacts").select("id,first_name,last_name,email,phone,job_title,company_id,company:companies(id,name)").eq("org_id", c.orgId)
        .or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`).limit(max ?? 20),
    ]);
    if (companies.error) throw new Error(companies.error.message);
    if (contacts.error) throw new Error(contacts.error.message);
    return json({ companies: companies.data, contacts: contacts.data });
  },
});

const listCompanies = defineDbTool({
  name: "list_companies",
  title: "List companies",
  description: "List customer companies, newest first; optional keyword on name or website.",
  inputSchema: { query: z.string().optional().describe("Keyword"), limit },
  handler: async ({ query, limit: max }, ctx) => {
    const c = ctx.appContext;
    requireAccess(c, "crm");
    let q = c.db.from("companies").select("id,name,industry,status,size,website,phone,city,country,created_at")
      .eq("org_id", c.orgId).eq("archived", false).order("created_at", { ascending: false }).limit(max ?? 25);
    if (term(query)) q = q.or(`name.ilike.%${term(query)}%,website.ilike.%${term(query)}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return json(data ?? []);
  },
});

const listContacts = defineDbTool({
  name: "list_contacts",
  title: "List contacts",
  description: "List contacts, newest first; filter by company or keyword.",
  inputSchema: { company_id: z.string().uuid().optional().describe("Only this company"), query: z.string().optional().describe("Keyword"), limit },
  handler: async ({ company_id, query, limit: max }, ctx) => {
    const c = ctx.appContext;
    requireAccess(c, "crm");
    let q = c.db.from("contacts").select("id,first_name,last_name,email,phone,job_title,lifecycle_stage,company:companies(id,name)")
      .eq("org_id", c.orgId).order("created_at", { ascending: false }).limit(max ?? 25);
    if (company_id) q = q.eq("company_id", company_id);
    if (term(query)) q = q.or(`first_name.ilike.%${term(query)}%,last_name.ilike.%${term(query)}%,email.ilike.%${term(query)}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return json(data ?? []);
  },
});

const LEAD_STATUSES = ["new", "contacted", "qualified", "converted", "unqualified", "lost"] as const;

const listLeads = defineDbTool({
  name: "list_leads",
  title: "List leads",
  description: "List sales leads, newest first; optional status or keyword.",
  inputSchema: { status: z.enum(LEAD_STATUSES).optional(), query: z.string().optional().describe("Keyword on name, email or company"), limit },
  handler: async ({ status, query, limit: max }, ctx) => {
    const c = ctx.appContext;
    requireAccess(c, "crm");
    let q = c.db.from("leads").select("id,name,company_name,email,phone,status,source,estimated_value,created_at")
      .eq("org_id", c.orgId).order("created_at", { ascending: false }).limit(max ?? 25);
    if (status) q = q.eq("status", status);
    if (term(query)) q = q.or(`name.ilike.%${term(query)}%,email.ilike.%${term(query)}%,company_name.ilike.%${term(query)}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return json(data ?? []);
  },
});

const leadsSummary = defineDbTool({
  name: "leads_summary",
  title: "How many leads?",
  description: "Count leads in total and by status, with their total estimated value. Use this for 'how many leads do we have?'.",
  handler: async (_args, ctx) => {
    const c = ctx.appContext;
    requireAccess(c, "crm");
    const counts = await Promise.all(LEAD_STATUSES.map(async (s) => {
      const { count, error } = await c.db.from("leads").select("id", { count: "exact", head: true }).eq("org_id", c.orgId).eq("status", s);
      if (error) throw new Error(error.message);
      return [s, count ?? 0] as const;
    }));
    const by_status = Object.fromEntries(counts);
    return json({ total: counts.reduce((n, [, v]) => n + v, 0), by_status, open: by_status.new + by_status.contacted + by_status.qualified, link: `${site()}/app/crm/leads` });
  },
});

const listDeals = defineDbTool({
  name: "list_deals",
  title: "List deals",
  description: "List deals (pipeline), newest first; optional status or keyword on title.",
  inputSchema: { status: z.enum(["open", "won", "lost"]).optional(), query: z.string().optional(), limit },
  handler: async ({ status, query, limit: max }, ctx) => {
    const c = ctx.appContext;
    requireAccess(c, "crm");
    let q = c.db.from("deals").select("id,title,amount,currency,status,probability,expected_close_date,company:companies(id,name),contact:contacts(id,first_name,last_name)")
      .eq("org_id", c.orgId).order("created_at", { ascending: false }).limit(max ?? 25);
    if (status) q = q.eq("status", status);
    if (term(query)) q = q.ilike("title", `%${term(query)}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return json(data ?? []);
  },
});

/* ------------------------------- invoicing ------------------------------- */

const listQuotes = defineDbTool({
  name: "list_quotes",
  title: "List quotes",
  description: "List quotes, newest first; optional status or customer company.",
  inputSchema: {
    status: z.enum(["draft", "sent", "accepted", "rejected", "expired", "converted"]).optional(),
    company_id: z.string().uuid().optional().describe("Only this customer"),
    limit,
  },
  handler: async ({ status, company_id, limit: max }, ctx) => {
    const c = ctx.appContext;
    requireAccess(c, "sales");
    let q = c.db.from("quotes").select("id,number,status,issue_date,expiry_date,currency,total,company:companies(id,name)")
      .eq("org_id", c.orgId).order("created_at", { ascending: false }).limit(max ?? 25);
    if (status) q = q.eq("status", status);
    if (company_id) q = q.eq("company_id", company_id);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return json(data ?? []);
  },
});

const listPayments = defineDbTool({
  name: "list_payments",
  title: "List payments",
  description: "Payments received in the last N days (default 30), newest first, with the invoice number, and their total.",
  inputSchema: { days: z.number().int().min(1).max(366).optional(), limit },
  handler: async ({ days, limit: max }, ctx) => {
    const c = ctx.appContext;
    requireAccess(c, "invoices");
    const since = new Date(Date.now() - (days ?? 30) * 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await c.db.from("payments").select("id,amount,currency,payment_date,reference,invoice:invoices(id,number)")
      .eq("org_id", c.orgId).gte("payment_date", since).order("payment_date", { ascending: false }).limit(max ?? 50);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    return json({ days: days ?? 30, total: rows.reduce((n, r) => n + Number(r.amount ?? 0), 0), payments: rows });
  },
});

const listInvoices = defineDbTool({
  name: "list_invoices",
  title: "List invoices",
  description: "List invoices, newest first; optional status or customer company.",
  inputSchema: {
    status: z.enum(["draft", "sent", "partially_paid", "paid", "overdue", "void"]).optional(),
    company_id: z.string().uuid().optional().describe("Only this customer"),
    limit,
  },
  handler: async ({ status, company_id, limit: max }, ctx) => {
    const c = ctx.appContext;
    requireAccess(c, "invoices");
    let q = c.db.from("invoices").select("id,number,status,issue_date,due_date,currency,total,amount_paid,balance_due,company:companies(id,name)")
      .eq("org_id", c.orgId).order("created_at", { ascending: false }).limit(max ?? 25);
    if (status) q = q.eq("status", status);
    if (company_id) q = q.eq("company_id", company_id);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return json(data ?? []);
  },
});

const getInvoice = defineDbTool({
  name: "get_invoice",
  title: "Get invoice",
  description: "One invoice in full: line items, payments and customer.",
  inputSchema: { invoice_id: z.string().uuid() },
  handler: async ({ invoice_id }, ctx) => {
    const c = ctx.appContext;
    requireAccess(c, "invoices");
    const { data: invoice, error } = await c.db.from("invoices")
      .select("*, company:companies(id,name,website,phone,city,country), contact:contacts(id,first_name,last_name,email)")
      .eq("id", invoice_id).eq("org_id", c.orgId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!invoice) throw new ToolError("Invoice not found in this workspace");
    const [items, payments] = await Promise.all([
      c.db.from("invoice_items").select("description,quantity,unit_price,discount_pct,tax_rate,line_total").eq("invoice_id", invoice_id).order("position"),
      c.db.from("payments").select("amount,currency,payment_date,reference").eq("invoice_id", invoice_id).eq("org_id", c.orgId).order("payment_date"),
    ]);
    return json({ invoice, items: items.data ?? [], payments: payments.data ?? [], link: `${site()}/app/invoices/${invoice_id}` });
  },
});

/* ------------------------------- inventory ------------------------------- */

const listProducts = defineDbTool({
  name: "list_products",
  title: "List products",
  description: "List products and services; optional keyword on name or SKU.",
  inputSchema: { query: z.string().optional(), limit },
  handler: async ({ query, limit: max }, ctx) => {
    const c = ctx.appContext;
    requireAccess(c, "inventory");
    let q = c.db.from("products").select("id,name,sku,product_type,currency,sale_price,cost_price,unit_of_measure,is_active,track_inventory")
      .eq("org_id", c.orgId).eq("archived", false).order("created_at", { ascending: false }).limit(max ?? 25);
    if (term(query)) q = q.or(`name.ilike.%${term(query)}%,sku.ilike.%${term(query)}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return json(data ?? []);
  },
});

const lowStock = defineDbTool({
  name: "low_stock",
  title: "Low and out-of-stock products",
  description: "Tracked products that are out of stock or at/below their low-stock threshold (same rule as the dashboard and the daily alert).",
  handler: async (_args, ctx) => {
    const c = ctx.appContext;
    requireAccess(c, "inventory");
    // ponytail: first 1000 tracked products; move to an RPC if a workspace tracks more.
    const [products, stock] = await Promise.all([
      c.db.from("products").select("id,name,sku,low_stock_threshold").eq("org_id", c.orgId).eq("track_inventory", true).eq("archived", false).limit(1000),
      c.db.from("inventory_stock").select("product_id,quantity").eq("org_id", c.orgId).limit(10000),
    ]);
    if (products.error) throw new Error(products.error.message);
    const onHand = new Map<string, number>();
    for (const s of stock.data ?? []) onHand.set(s.product_id, (onHand.get(s.product_id) ?? 0) + Number(s.quantity ?? 0));
    const rows = (products.data ?? []).map((p) => ({ ...p, on_hand: onHand.get(p.id) ?? 0 }))
      .filter((p) => p.on_hand <= 0 || (Number(p.low_stock_threshold) > 0 && p.on_hand <= Number(p.low_stock_threshold)))
      .map((p) => ({ ...p, state: p.on_hand <= 0 ? "out of stock" : "low", link: `${site()}/app/products/${p.id}` }));
    return json({ count: rows.length, products: rows });
  },
});

/* -------------------------------- projects ------------------------------- */

const listProjects = defineDbTool({
  name: "list_projects",
  title: "List projects",
  description: "List projects, newest first; optional status.",
  inputSchema: { status: z.enum(["planned", "active", "on_hold", "completed", "cancelled"]).optional(), limit },
  handler: async ({ status, limit: max }, ctx) => {
    const c = ctx.appContext;
    requireAccess(c, "projects");
    let q = c.db.from("projects").select("id,code,name,status,start_date,due_date,budget,currency,customer_company:companies(id,name)")
      .eq("org_id", c.orgId).order("created_at", { ascending: false }).limit(max ?? 25);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return json(data ?? []);
  },
});

const listProjectTasks = defineDbTool({
  name: "list_project_tasks",
  title: "List project tasks",
  description: "List tasks, optionally for one project or status.",
  inputSchema: {
    project_id: z.string().uuid().optional(),
    status: z.enum(["todo", "in_progress", "review", "blocked", "done", "cancelled"]).optional(),
    limit,
  },
  handler: async ({ project_id, status, limit: max }, ctx) => {
    const c = ctx.appContext;
    requireAccess(c, "projects");
    let q = c.db.from("project_tasks").select("id,title,status,priority,due_date,project_id")
      .eq("org_id", c.orgId).order("position").limit(max ?? 25);
    if (project_id) q = q.eq("project_id", project_id);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return json(data ?? []);
  },
});

/* -------------------------------- agents -------------------------------- */

const listAgents = defineDbTool({
  name: "list_agents",
  title: "List AI agents",
  description: "The workspace's AI agents: status, when they run (by hand, on a schedule, on an event) and their last run.",
  handler: async (_a, ctx) => {
    const c = ctx.appContext;
    requireAccess(c, "reports");
    const { data, error } = await c.db.from("ai_agents").select("id,name,status,description,last_run_at,ai_agent_triggers(trigger_type,trigger_name,is_enabled)")
      .eq("org_id", c.orgId).neq("status", "archived").order("name");
    if (error) throw new Error(error.message);
    return json(data ?? []);
  },
});

/* --------------------------------- writes -------------------------------- */

type ActionKey = "create_lead" | "create_company" | "create_contact" | "create_task" | "log_activity" | "create_agent";

async function propose(c: McpAppContext, module: ModuleKey, actionKey: ActionKey, title: string, payload: Record<string, unknown>) {
  requireAccess(c, module, true);
  // The service role (personal keys) isn't stopped by the plan lock, so check it here for both paths.
  const { data: active } = await c.db.rpc("org_is_active", { _org: c.orgId });
  if (active === false) throw new ToolError("This workspace's plan has ended, so it's read-only. An owner can renew it in Settings › Billing.");
  const { proposeAction } = await import("@/lib/ai/entity-ai.functions");
  const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined && v !== ""));
  const r = await proposeAction(c.db, c.userId, { orgId: c.orgId, actionKey, title, payload: clean });
  if (r.status === "executed") return json({ status: "done", action_id: r.id, message: `${title}: done.` });
  if (r.status === "failed") return json({ status: "failed", action_id: r.id, message: "It was approved automatically but failed; call get_action_status for the reason." });
  // The approval notice is in the bell already (trigger); send its email now, the user may not have Inuberry open.
  const { dispatchNotificationEmails } = await import("@/lib/notifications/email.server");
  await dispatchNotificationEmails(site(), c.orgId).catch(() => {});
  return json({
    status: "pending_approval",
    action_id: r.id,
    review_url: `${site()}/app/inbox?tab=approvals&action=${r.id}`,
    message: `Waiting for a person to approve it in Inuberry: ${site()}/app/inbox?tab=approvals&action=${r.id} (they also got a notification). Call get_action_status with this action_id to see when it's done.`,
  });
}

const createLead = defineDbTool({
  name: "create_lead",
  title: "Create a lead",
  description: "Propose a new sales lead. Follows the workspace's AI approval policy (usually a person approves it in Inuberry first).",
  inputSchema: {
    name: z.string().min(1).max(200).describe("Person or lead name"),
    email: z.string().email().optional(),
    phone: z.string().max(50).optional(),
    company_name: z.string().max(200).optional(),
    job_title: z.string().max(200).optional(),
    estimated_value: z.number().nonnegative().optional(),
    notes: z.string().max(4000).optional(),
  },
  handler: async (a, ctx) => propose(ctx.appContext, "crm", "create_lead", `Create lead: ${a.name}`, { ...a, source: "ai_agent" }),
});

const createCompany = defineDbTool({
  name: "create_company",
  title: "Create a company",
  description: "Propose a new customer company (an existing company with the same name is reused). Follows the approval policy.",
  inputSchema: {
    name: z.string().min(1).max(200),
    industry: z.string().max(100).optional(),
    website: z.string().max(300).optional(),
    phone: z.string().max(50).optional(),
    city: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
  },
  handler: async (a, ctx) => propose(ctx.appContext, "crm", "create_company", `Create company: ${a.name}`, a),
});

const createContact = defineDbTool({
  name: "create_contact",
  title: "Create a contact",
  description: "Propose a new contact, optionally at an existing company (company_id, or company_name of an existing company). Follows the approval policy.",
  inputSchema: {
    first_name: z.string().min(1).max(100),
    last_name: z.string().max(100).optional(),
    email: z.string().email().optional(),
    phone: z.string().max(50).optional(),
    job_title: z.string().max(200).optional(),
    company_id: z.string().uuid().optional(),
    company_name: z.string().max(200).optional(),
  },
  handler: async (a, ctx) => propose(ctx.appContext, "crm", "create_contact", `Create contact: ${[a.first_name, a.last_name].filter(Boolean).join(" ")}`, a),
});

const createTask = defineDbTool({
  name: "create_task",
  title: "Create a project task",
  description: "Propose a task in a project (project_id, or the name of an existing project). Follows the approval policy.",
  inputSchema: {
    title: z.string().min(1).max(200),
    project_id: z.string().uuid().optional(),
    project_name: z.string().max(200).optional(),
    description: z.string().max(4000).optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    due_date: z.string().date().optional().describe("YYYY-MM-DD"),
  },
  handler: async (a, ctx) => {
    if (!a.project_id && !a.project_name) throw new ToolError("Which project? Give project_id or project_name (see list_projects).");
    return propose(ctx.appContext, "projects", "create_task", `Create task: ${a.title}`, a);
  },
});

const logActivity = defineDbTool({
  name: "log_activity",
  title: "Log an activity",
  description: "Propose a call, email, meeting or note on a company, contact, deal or lead. Follows the approval policy.",
  inputSchema: {
    entity_type: z.enum(["company", "contact", "deal", "lead"]),
    entity_id: z.string().uuid(),
    title: z.string().min(1).max(200),
    description: z.string().max(4000).optional(),
    type: z.enum(["call", "email", "meeting", "note", "follow_up", "task"]).optional(),
  },
  handler: async (a, ctx) => propose(ctx.appContext, "crm", "log_activity", `Log ${a.type ?? "note"}: ${a.title}`, a),
});

const createAgent = defineDbTool({
  name: "create_agent",
  title: "Create an AI agent",
  description: "Propose an Inuberry AI agent that does a job by hand, on a schedule or when something happens. Ask the user what it should do, which data it may use, when it runs and what needs their OK first. Always waits for a person to approve it in Inuberry.",
  inputSchema: {
    name: z.string().min(1).max(80),
    description: z.string().max(500).optional(),
    instructions: z.string().min(10).max(8000).describe("What it does on every run, its rules and tone"),
    modules: z.array(z.object({
      module: z.enum(["crm", "sales", "invoices", "payments", "inventory", "purchasing", "accounting", "projects", "hr", "reports"]),
      read: z.boolean().optional(), create: z.boolean().optional(), update: z.boolean().optional(),
    })).max(12),
    tools: z.array(z.string()).max(20).describe("Tool names, e.g. invoice_search, crm_list_deals, crm_add_note, task_create, notification_create, send_email, team_chat_post"),
    triggers: z.array(z.union([
      z.object({ type: z.literal("manual") }),
      z.object({ type: z.literal("scheduled"), config: z.object({ every: z.enum(["hour", "day", "weekday", "week"]), at: z.string().optional().describe("HH:MM"), day: z.number().int().min(0).max(6).optional().describe("0 = Sunday"), tz: z.string().optional(), prompt: z.string().max(2000).optional() }) }),
      z.object({ type: z.literal("event_based"), config: z.object({ event: z.string().describe("alert.invoice_overdue, alert.deal_stale, alert.low_stock, alert.task_overdue, crm.lead, forms.form, support.support_ticket, sales.quote_response, invoices.paid, hr.leave_request"), prompt: z.string().max(2000).optional() }) }),
    ])).max(5).optional(),
    activate: z.boolean().optional(),
  },
  handler: async (a, ctx) => propose(ctx.appContext, "settings", "create_agent", `Create an AI agent: ${a.name}`, { ...a, triggers: a.triggers ?? [] }),
});

const getActionStatus = defineDbTool({
  name: "get_action_status",
  title: "Check a proposed change",
  description: "Status of a change proposed by create_* or log_activity: pending, approved/executed (with the result), rejected or failed.",
  inputSchema: { action_id: z.string().uuid() },
  handler: async ({ action_id }, ctx) => {
    const c = ctx.appContext;
    const { data, error } = await c.db.from("ai_proposed_actions").select("id,title,status,result,error,created_at,decided_at")
      .eq("id", action_id).eq("org_id", c.orgId).eq("user_id", c.userId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new ToolError("No such proposed change for you in this workspace");
    return json(data);
  },
});

/* --------------------------------- help ---------------------------------- */

// Questions about Inuberry itself ("how do I invite someone?", "what happens when my plan ends?").
// Answers come from the same text as the public guides (/docs) and the in-app assistant.
const STOP = new Set("the and for how can what does with this that from your you are any into have will when where which who why".split(" "));
const words = (s: string) => (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2 && !STOP.has(w)).map(stem);
// Action words say what to do, not what about: "create an invoice" is about invoices.
const GENERIC = new Set(["add", "new", "make", "use", "get", "find", "see", "change", "edit", "open", "show", "start"].map((w) => w.replace(/(ing|ed|al|e)$/, "")).concat("creat"));

/** Rough word stem, so "approve", "approvals" and "approved" match: drop a plural s, then -ing/-ed/-al/-e. */
function stem(w: string) {
  return w.replace(/([^s])s$/, "$1").replace(/(ing|ed|al|e)$/, "");
}

/**
 * Best guide passages for a question. Rare words count more than common ones (a word found in
 * most passages, like "create", says little), a match in a passage's title counts three times, and
 * a passage that matches more of the question's words ranks higher.
 */
export function rankHelp<T extends { title: string; text: string }>(question: string, entries: T[], limit = 4) {
  const docs = entries.map((e) => ({ e, title: new Set(words(e.title)), text: new Set(words(e.text)) }));
  const df = new Map<string, number>();
  for (const d of docs) for (const w of new Set([...d.title, ...d.text])) df.set(w, (df.get(w) ?? 0) + 1);
  const idf = (w: string) => Math.log((docs.length + 1) / ((df.get(w) ?? 0) + 1));
  const q = new Set(words(question));
  return docs
    .map(({ e, title, text }) => {
      let score = 0, hits = 0;
      for (const w of q) {
        const s = idf(w) * ((title.has(w) ? 3 : 0) + (text.has(w) ? 1 : 0)) * (GENERIC.has(w) ? 0.3 : 1);
        if (s > 0) { score += s; hits++; }
      }
      return { ...e, score: score * (hits / Math.max(1, q.size)) };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}

const inuberryHelp = defineDbTool({
  name: "inuberry_help",
  title: "How Inuberry works",
  description: "Answer questions about using Inuberry: where something is, how to do a task, plans and billing, AI approvals, notifications, connecting AI apps, self-hosting and updates. Returns the best matching guide passages with links. Use it before guessing how the app works.",
  inputSchema: { question: z.string().min(2).max(500).describe("The user's question, in their words") },
  handler: async ({ question }) => {
    const [{ docSections }, { guideEntries }] = await Promise.all([import("@/lib/docs/content"), import("@/lib/ai/app-guide")]);
    const scored = rankHelp(question, [...docSections(), ...guideEntries()]);
    if (!scored.length) {
      return json({ answer: null, message: `Nothing in the guides matches that. The guides are at ${site()}/docs; the FAQ is at ${site()}/docs/faq.` });
    }
    return json({
      results: scored.map((e) => ({ title: e.title, text: e.text.slice(0, 1500), link: `${site()}${e.url}` })),
      note: "Answer from these passages and give the user the link. Paths starting /app are pages inside Inuberry.",
    });
  },
});

export const TOOLS = [
  inuberryHelp,
  listWorkspaces, searchCustomers, listCompanies, listContacts, listLeads, leadsSummary, listDeals,
  listQuotes, listInvoices, getInvoice, listPayments, listProducts, lowStock, listProjects, listProjectTasks, listAgents,
  createLead, createCompany, createContact, createTask, logActivity, createAgent, getActionStatus,
];
