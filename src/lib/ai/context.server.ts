// Context engine — turns an entity reference into grounded, permission-scoped
// context text that the AI gateway can reason over. All reads go through the
// caller's Supabase client, so RLS decides what the AI can see.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type SB = SupabaseClient<Database>;

export const ENTITY_TYPES = [
  "company",
  "contact",
  "deal",
  "invoice",
  "project",
  "product",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export type EntityContext = {
  label: string;
  text: string;
};

function j(label: string, value: unknown): string {
  return `${label}:\n${JSON.stringify(value ?? null)}`;
}

export async function buildEntityContext(
  supabase: SB,
  orgId: string,
  entityType: EntityType,
  entityId: string,
): Promise<EntityContext> {
  const parts: string[] = [];
  let label: string = entityType;

  if (entityType === "company") {
    const [co, contacts, deals, invoices, acts] = await Promise.all([
      supabase.from("companies").select("name,industry,size,status,website,phone,city,country").eq("id", entityId).maybeSingle(),
      supabase.from("contacts").select("first_name,last_name,email,phone,job_title").eq("company_id", entityId).limit(20),
      supabase.from("deals").select("title,amount,currency,probability,status,expected_close_date").eq("company_id", entityId).limit(20),
      supabase.from("invoices").select("number,status,total,balance_due,currency,issue_date,due_date").eq("company_id", entityId).order("issue_date", { ascending: false }).limit(20),
      supabase.from("activities").select("type,title,description,due_at").eq("entity_type", "company").eq("entity_id", entityId).order("created_at", { ascending: false }).limit(15),
    ]);
    label = co.data?.name ?? "Company";
    parts.push(j("COMPANY", co.data), j("CONTACTS", contacts.data), j("DEALS", deals.data), j("INVOICES", invoices.data), j("RECENT ACTIVITY", acts.data));
  } else if (entityType === "contact") {
    const [c, deals, acts] = await Promise.all([
      supabase.from("contacts").select("first_name,last_name,email,phone,job_title,lifecycle_stage,notes,company_id").eq("id", entityId).maybeSingle(),
      supabase.from("deals").select("title,amount,currency,probability,status,expected_close_date").eq("contact_id", entityId).limit(20),
      supabase.from("activities").select("type,title,description,due_at").eq("entity_type", "contact").eq("entity_id", entityId).order("created_at", { ascending: false }).limit(15),
    ]);
    label = [c.data?.first_name, c.data?.last_name].filter(Boolean).join(" ") || "Contact";
    parts.push(j("CONTACT", c.data), j("DEALS", deals.data), j("RECENT ACTIVITY", acts.data));
  } else if (entityType === "deal") {
    const [d, acts] = await Promise.all([
      supabase.from("deals").select("title,amount,currency,probability,status,expected_close_date,stage_id,company_id,contact_id").eq("id", entityId).maybeSingle(),
      supabase.from("activities").select("type,title,description,due_at").eq("entity_type", "deal").eq("entity_id", entityId).order("created_at", { ascending: false }).limit(15),
    ]);
    label = d.data?.title ?? "Deal";
    parts.push(j("DEAL", d.data), j("RECENT ACTIVITY", acts.data));
  } else if (entityType === "invoice") {
    const [inv, items, pays] = await Promise.all([
      supabase.from("invoices").select("number,status,issue_date,due_date,currency,subtotal,tax_total,total,amount_paid,balance_due,company_id,contact_id").eq("id", entityId).maybeSingle(),
      supabase.from("invoice_items").select("description,quantity,unit_price,line_total").eq("invoice_id", entityId).limit(100),
      supabase.from("payments").select("amount,payment_date,reference").eq("invoice_id", entityId).limit(50),
    ]);
    label = inv.data?.number ? `Invoice ${inv.data.number}` : "Invoice";
    parts.push(j("INVOICE", inv.data), j("LINE ITEMS", items.data), j("PAYMENTS", pays.data));
  } else if (entityType === "project") {
    const [p, tasks] = await Promise.all([
      supabase.from("projects").select("code,name,status,start_date,due_date,budget,currency,customer_company_id").eq("id", entityId).maybeSingle(),
      supabase.from("project_tasks").select("title,status,priority,due_date,estimated_hours").eq("project_id", entityId).limit(100),
    ]);
    label = p.data?.name ?? "Project";
    parts.push(j("PROJECT", p.data), j("TASKS", tasks.data));
  } else if (entityType === "product") {
    const p = await supabase.from("products").select("name,sku,product_type,currency,sale_price,cost_price,description").eq("id", entityId).maybeSingle();
    label = p.data?.name ?? "Product";
    parts.push(j("PRODUCT", p.data));
  }

  // Org-level framing that applies to every entity.
  const { data: org } = await supabase.from("organizations").select("name").eq("id", orgId).maybeSingle();
  parts.unshift(`WORKSPACE: ${org?.name ?? "this workspace"}`, `TODAY: ${new Date().toISOString().slice(0, 10)}`);

  return { label, text: parts.join("\n\n") };
}

export const BRIEF_PROMPTS: Record<EntityType, string> = {
  company: "Write a short account briefing: who they are, billing health (overdue balances), open deals, and 2-3 concrete next steps.",
  contact: "Write a short relationship briefing: role, recent engagement, open deals, and the best next touchpoint.",
  deal: "Assess this deal: current position, risk signals, and the next action to move it forward.",
  invoice: "Summarize this invoice: amounts, payment state, and whether any collection action is warranted.",
  project: "Summarize project status: progress, overdue or blocked tasks, upcoming work, and risks.",
  product: "Summarize this product: positioning, pricing and margin, and any pricing observations.",
};

/** Compact, RLS-scoped snapshot of the workspace for free-form assistant chat. */
export async function buildOrgSnapshot(supabase: SB, orgId: string): Promise<string> {
  const db = supabase as unknown as { from: (t: string) => any };
  const count = async (table: string, apply?: (q: any) => any) => {
    let q = db.from(table).select("id", { count: "exact", head: true }).eq("org_id", orgId);
    if (apply) q = apply(q);
    const { count: c } = await q;
    return c ?? 0;
  };
  const [
    contacts, companies, openProjects, openTasks, productsCount,
    stages, deals, openInv, stock, recentContacts, recentDeals, recentInvoices,
  ] = await Promise.all([
    count("contacts", (q) => q.eq("archived", false)),
    count("companies", (q) => q.eq("archived", false)),
    count("projects", (q) => q.not("status", "in", "(completed,cancelled)")),
    count("project_tasks", (q) => q.not("status", "in", "(done,cancelled)")),
    count("products", (q) => q.eq("archived", false)),
    supabase.from("deal_stages").select("id,name").eq("org_id", orgId),
    supabase.from("deals").select("stage_id,amount,status").eq("org_id", orgId).limit(1000),
    supabase.from("invoices").select("balance_due,currency").eq("org_id", orgId).in("status", ["sent", "partially_paid", "overdue"]).limit(1000),
    supabase.from("inventory_stock").select("quantity,products:product_id(name,low_stock_threshold)").eq("org_id", orgId).limit(500),
    supabase.from("contacts").select("first_name,last_name,email,job_title,companies:company_id(name)").eq("org_id", orgId).eq("archived", false).order("created_at", { ascending: false }).limit(10),
    supabase.from("deals").select("title,amount,currency,status").eq("org_id", orgId).order("created_at", { ascending: false }).limit(10),
    supabase.from("invoices").select("number,status,total,balance_due,currency").eq("org_id", orgId).order("created_at", { ascending: false }).limit(10),
  ]);

  const stageName = new Map<string, string>((stages.data ?? []).map((s) => [s.id, s.name]));
  const byStage: Record<string, { count: number; value: number }> = {};
  for (const d of deals.data ?? []) {
    const k = (d.stage_id && stageName.get(d.stage_id)) ?? "No stage";
    byStage[k] ??= { count: 0, value: 0 };
    byStage[k].count++;
    byStage[k].value += Number(d.amount ?? 0);
  }
  const balance = (openInv.data ?? []).reduce((s: number, i) => s + Number(i.balance_due ?? 0), 0);
  const lowStock = (stock.data ?? [])
    .filter((r) => (r.products?.low_stock_threshold ?? 0) > 0 && Number(r.quantity) <= (r.products?.low_stock_threshold ?? 0))
    .map((r) => `${r.products?.name} (${r.quantity})`);

  const summary = {
    counts: {
      contacts, companies, deals: (deals.data ?? []).length, products: productsCount,
      open_projects: openProjects, open_tasks: openTasks,
      open_invoices: (openInv.data ?? []).length, open_invoice_balance_due: Number(balance.toFixed(2)),
    },
    deals_by_stage: byStage,
    low_stock_products: lowStock.slice(0, 20),
    recent_contacts: (recentContacts.data ?? []).map((c) => ({
      name: [c.first_name, c.last_name].filter(Boolean).join(" "), email: c.email, job_title: c.job_title, company: c.companies?.name ?? null,
    })),
    recent_deals: recentDeals.data ?? [],
    recent_invoices: recentInvoices.data ?? [],
  };
  return `WORKSPACE SNAPSHOT (live, as of ${new Date().toISOString().slice(0, 10)}; "recent_*" lists show at most 10 items — the counts are the true totals):\n${JSON.stringify(summary)}`;
}
