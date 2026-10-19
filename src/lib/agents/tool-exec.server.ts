// Shared tool executor used by the agent runtime (read-only tools) and by
// approved-action execution. Runs through the caller's RLS-scoped client.
import { createServerOnlyFn } from "@tanstack/react-start";
import { notifyOrg } from "@/lib/notify-org";

// The mailer is Node-only. This file is reachable from code the browser bundle also sees (the
// assistant), so the import sits behind a server-only function that the browser build drops.
const loadMailer = createServerOnlyFn(async () => {
  const [{ loadOrgMailbox }, smtp] = await Promise.all([import("@/lib/settings/mail.functions"), import("@/lib/email/smtp.server")]);
  return { loadOrgMailbox, ...smtp };
});

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function executeAgentTool(
  supabase: unknown,
  orgId: string,
  toolName: string,
  args: Record<string, unknown>,
  /** The person the write is done for (owner / created by), when known. */
  userId?: string | null,
): Promise<any> {
  const sb = supabase as { from: (t: string) => any; rpc: (n: string, a: Record<string, unknown>) => any };
    const a = args as Record<string, any>;
    try {
      switch (toolName) {
        case "crm_update_deal": {
          const upd: Record<string, unknown> = {};
          if (a.stage_id) upd.stage_id = a.stage_id;
          if (a.amount != null) upd.amount = Number(a.amount);
          if (a.probability != null) upd.probability = Number(a.probability);
          if (a.status) upd.status = a.status;
          if (Object.keys(upd).length === 0) return { status: "noop", reason: "no fields to update" };
          const { data: row, error } = await sb.from("deals").update(upd).eq("id", a.deal_id).eq("org_id", orgId).select("id,title,amount,stage_id,status").single();
          if (error) throw error;
          return { status: "ok", deal: row };
        }

        case "crm_create_lead": {
          if (!a.name) return { status: "error", error: "Lead name is required" };
          const { data: row, error } = await sb.from("leads").insert({
            org_id: orgId,
            name: String(a.name),
            email: a.email ?? null,
            phone: a.phone ?? null,
            company_name: a.company_name ?? a.company ?? null,
            job_title: a.job_title ?? null,
            source: a.source ?? "ai_agent",
            estimated_value: a.estimated_value != null ? Number(a.estimated_value) : null,
            notes: a.notes ?? null,
            owner_id: userId ?? null, created_by: userId ?? null,
          }).select("id,name,status").single();
          if (error) throw error;
          return { status: "ok", lead: row, link: "/app/crm/leads" };
        }

        case "crm_list_leads": {
          let q = sb.from("leads").select("id,name,email,company_name,status,estimated_value,created_at").eq("org_id", orgId);
          const term = String(a.query ?? "").replace(/[%,()*]/g, " ").trim();
          if (term) q = q.or(`name.ilike.%${term}%,email.ilike.%${term}%,company_name.ilike.%${term}%`);
          if (a.status) q = q.eq("status", a.status);
          const { data: rows, error } = await q.order("created_at", { ascending: false }).limit(20);
          if (error) throw error;
          return { status: "ok", leads: rows ?? [] };
        }

        case "crm_list_deals": {
          const status = ["open", "won", "lost", "all"].includes(String(a.status)) ? String(a.status) : "open";
          let q = sb.from("deals").select("id,title,amount,currency,status,probability,expected_close_date,deal_stages:stage_id(name),companies:company_id(name)", { count: "exact" }).eq("org_id", orgId);
          if (status !== "all") q = q.eq("status", status);
          const term = String(a.query ?? "").replace(/[%,()*]/g, " ").trim();
          if (term) q = q.ilike("title", `%${term}%`);
          const { data: rows, count, error } = await q.order("amount", { ascending: false }).limit(20);
          if (error) throw error;
          // The total covers every match, not just the 20 rows listed (one small column, summed here).
          let sumQ = sb.from("deals").select("amount").eq("org_id", orgId);
          if (status !== "all") sumQ = sumQ.eq("status", status);
          if (term) sumQ = sumQ.ilike("title", `%${term}%`);
          const { data: amounts } = await sumQ.limit(10000);
          const total = (amounts ?? []).reduce((n: number, d: { amount: number | null }) => n + Number(d.amount ?? 0), 0);
          return { status: "ok", count: count ?? rows?.length ?? 0, total_amount: total, deals: rows ?? [], link: "/app/crm/deals" };
        }

        case "crm_create_company": {
          const name = String(a.name ?? "").trim();
          if (!name) return { status: "error", error: "Company name is required" };
          // Same name (any case) already there: use it instead of making a duplicate.
          const { data: existing } = await sb.from("companies").select("id,name").eq("org_id", orgId).eq("archived", false)
            .ilike("name", name.replace(/[\\%_]/g, "\\$&")).limit(1).maybeSingle();
          if (existing) return { status: "ok", company: existing, existed: true, link: `/app/crm/companies/${existing.id}` };
          const { data: row, error } = await sb.from("companies").insert({
            org_id: orgId, name,
            industry: a.industry ?? null, website: a.website ?? null, phone: a.phone ?? null,
            address: a.address ?? null, city: a.city ?? null, country: a.country ?? null,
            owner_id: userId ?? null, created_by: userId ?? null,
          }).select("id,name").single();
          if (error) throw error;
          return { status: "ok", company: row, link: `/app/crm/companies/${row.id}` };
        }

        case "crm_create_contact": {
          const first = String(a.first_name ?? "").trim();
          if (!first) return { status: "error", error: "First name is required" };
          let companyId = (a.company_id as string | undefined) ?? null;
          if (!companyId && a.company_name) {
            const { data: co } = await sb.from("companies").select("id").eq("org_id", orgId).eq("archived", false)
              .ilike("name", String(a.company_name).replace(/[%,()*]/g, " ").trim()).limit(1).maybeSingle();
            companyId = co?.id ?? null;
            if (!companyId) return { status: "error", error: `No company named "${a.company_name}". Create the company first, or leave it out.` };
          }
          const { data: row, error } = await sb.from("contacts").insert({
            org_id: orgId, first_name: first,
            last_name: a.last_name ?? null, email: a.email ?? null, phone: a.phone ?? null,
            job_title: a.job_title ?? null, company_id: companyId,
            owner_id: userId ?? null, created_by: userId ?? null,
          }).select("id,first_name,last_name").single();
          if (error) throw error;
          return { status: "ok", contact: row, link: `/app/crm/contacts/${row.id}` };
        }

        case "task_create": {
          const title = String(a.title ?? "").trim();
          if (!title) return { status: "error", error: "Task title is required" };
          let projectId = (a.project_id as string | undefined) ?? null;
          if (!projectId && a.project_name) {
            const { data: pr } = await sb.from("projects").select("id").eq("org_id", orgId)
              .ilike("name", String(a.project_name).replace(/[%,()*]/g, " ").trim()).limit(1).maybeSingle();
            projectId = pr?.id ?? null;
          }
          if (!projectId) return { status: "error", error: "Which project? Tasks belong to a project (project_id or an existing project_name)." };
          const priority = ["low", "medium", "high", "urgent"].includes(String(a.priority)) ? String(a.priority) : "medium";
          const { data: row, error } = await sb.from("project_tasks").insert({
            org_id: orgId, project_id: projectId, title,
            description: a.description ?? null, due_date: a.due_date ?? null,
            priority, status: "todo", reporter_id: userId ?? null,
          }).select("id,title,project_id").single();
          if (error) throw error;
          return { status: "ok", task: row, link: `/app/projects/${row.project_id}` };
        }

        case "crm_create_activity":
        case "crm_add_note": {
          const target: [string, unknown] | null =
            a.deal_id ? ["deal", a.deal_id] :
            a.contact_id ? ["contact", a.contact_id] :
            a.company_id ? ["company", a.company_id] :
            a.lead_id ? ["lead", a.lead_id] :
            a.entity_type && a.entity_id ? [String(a.entity_type), a.entity_id] : null;
          const text = String(a.note ?? a.description ?? a.body ?? a.text ?? "").trim();
          const allowedTypes = ["call", "email", "meeting", "task", "follow_up", "note"];
          const type = allowedTypes.includes(String(a.type)) ? String(a.type) : "note";
          const { data: row, error } = await sb.from("activities").insert({
            org_id: orgId,
            type,
            title: String(a.subject ?? a.title ?? (text ? text.slice(0, 80) : "AI agent note")),
            description: text || null,
            entity_type: target?.[0] ?? null,
            entity_id: target?.[1] ?? null,
            completed: type === "note",
            completed_at: type === "note" ? new Date().toISOString() : null,
          }).select("id,title,type,entity_type,entity_id").single();
          if (error) throw error;
          return { status: "ok", activity: row };
        }

        case "invoice_create_draft": {
          const { data: numData, error: numErr } = await (sb.rpc("next_doc_number", { _org: orgId, _doc: "invoice" }) as Promise<{ data: unknown; error?: { message: string } | null }>);
          if (numErr || !numData) return { status: "error", error: `Could not generate invoice number: ${numErr?.message ?? "no number returned"}` };
          const number = numData as string;
          const { data: inv, error } = await sb.from("invoices").insert({
            org_id: orgId,
            number,
            company_id: a.company_id ?? null,
            contact_id: a.contact_id ?? null,
            currency: a.currency ?? "USD",
            issue_date: a.issue_date ?? new Date().toISOString().slice(0, 10),
            due_date: a.due_date ?? null,
            notes: a.notes ?? "Drafted by AI agent",
            status: "draft",
          }).select("id,number,status").single();
          if (error) throw error;

          // Lines arrive as a list, or as a JSON string (the tool schema only has string arguments).
          let items: any[] = Array.isArray(a.items) ? a.items : [];
          if (typeof a.items === "string" && a.items.trim()) {
            try { const parsed = JSON.parse(a.items); if (Array.isArray(parsed)) items = parsed; }
            catch { return { status: "error", error: "items must be a JSON list of lines" }; }
          }
          if (items.length > 0) {
            const lines = items.map((it: any, i: number) => ({
              org_id: orgId,
              invoice_id: inv.id,
              product_id: it.product_id ?? null,
              description: it.description ?? "Item",
              quantity: Number(it.quantity ?? 1),
              unit_price: Number(it.unit_price ?? 0),
              discount_pct: Number(it.discount_pct ?? 0),
              tax_rate: Number(it.tax_rate ?? 0),
              position: i + 1,
            }));
            const { error: lineErr } = await sb.from("invoice_items").insert(lines);
            if (lineErr) throw lineErr;
          }
          return { status: "ok", invoice: inv };
        }

        case "invoice_send_reminder": {
          const { error } = await notifyOrg(sb, orgId, {
            title: "Invoice reminder",
            body: a.message ?? "Friendly reminder about outstanding invoice.",
            module: "invoices",
            entityType: "invoice",
            entityId: a.invoice_id ?? null,
            link: a.invoice_id ? `/app/invoices/${a.invoice_id}` : null,
          });
          if (error) throw new Error(error.message);
          return { status: "ok" };
        }

        case "invoice_search": {
          let q = sb.from("invoices").select("id,number,status,total,balance_due,due_date,currency,company_id").eq("org_id", orgId);
          if (a.status) q = q.eq("status", a.status);
          if (a.company_id) q = q.eq("company_id", a.company_id);
          const { data: rows, error } = await q.order("issue_date", { ascending: false }).limit(20);
          if (error) throw error;
          return { status: "ok", invoices: rows ?? [] };
        }

        // For /low-stock (not in TOOL_REGISTRY). Uses products_with_stock, so a tracked product that was
        // never stocked counts as out, which a look at inventory_stock rows alone would miss.
        case "inventory_low_stock": {
          const { data: rows, error } = await sb.from("products_with_stock")
            .select("id,name,sku,on_hand,low_stock_threshold,stock_status")
            .eq("org_id", orgId).eq("archived", false).in("stock_status", ["low", "out"])
            .order("on_hand", { ascending: true }).limit(100);
          if (error) throw error;
          return { status: "ok", products: rows ?? [] };
        }

        case "inventory_check_stock": {
          let q = sb.from("inventory_stock")
            .select("quantity,product_id,warehouse_id,products:product_id(name,sku,low_stock_threshold)")
            .eq("org_id", orgId);
          if (a.product_id) q = q.eq("product_id", a.product_id);
          if (a.warehouse_id) q = q.eq("warehouse_id", a.warehouse_id);
          const { data: rows, error } = await q.limit(50);
          if (error) throw error;
          return { status: "ok", stock: rows ?? [] };
        }

        case "crm_search_contacts": {
          const term = String(a.query ?? "").trim();
          const safe = term.replace(/[%,()*]/g, " ").replace(/\s+/g, " ").trim();
          let companyIds: string[] = [];
          if (safe) {
            const { data: cos } = await sb.from("companies").select("id").eq("org_id", orgId).eq("archived", false).ilike("name", `%${safe}%`).limit(20);
            companyIds = (cos ?? []).map((c: { id: string }) => c.id);
          }
          let q = sb.from("contacts").select("id,first_name,last_name,email,phone,job_title,company_id,companies:company_id(name)").eq("org_id", orgId).eq("archived", false);
          if (safe) {
            const words = safe.split(/[\s]+/).filter(Boolean);
            const ors = [`first_name.ilike.%${safe}%`, `last_name.ilike.%${safe}%`, `email.ilike.%${safe}%`];
            if (words.length > 1) {
              const first = words[0], last = words[words.length - 1];
              ors.push(`and(first_name.ilike.%${first}%,last_name.ilike.%${last}%)`);
              // Names stored in a single field ("QA-Jane Doe" in first_name)
              ors.push(`first_name.ilike.%${words.join("%")}%`);
            }
            if (companyIds.length) ors.push(`company_id.in.(${companyIds.join(",")})`);
            q = q.or(ors.join(","));
          }
          const { data: rows, error } = await q.limit(20);
          if (error) throw error;
          return { status: "ok", contacts: rows ?? [] };
        }

        case "invoice_mark_sent": {
          if (!a.invoice_id) return { status: "error", error: "Which invoice? (invoice_id)" };
          const { data: row, error } = await sb.from("invoices").update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", a.invoice_id).eq("org_id", orgId).eq("status", "draft").select("id,number,status").maybeSingle();
          if (error) throw error;
          if (!row) return { status: "error", error: "Only a draft invoice can be marked as sent." };
          return { status: "ok", invoice: row, link: `/app/invoices/${row.id}` };
        }

        case "payment_record": {
          const amount = Number(a.amount);
          if (!a.invoice_id || !(amount > 0)) return { status: "error", error: "An invoice_id and an amount above 0 are needed." };
          const { data: inv, error: invErr } = await sb.from("invoices").select("id,number,currency,balance_due,status")
            .eq("id", a.invoice_id).eq("org_id", orgId).maybeSingle();
          if (invErr) throw invErr;
          if (!inv) return { status: "error", error: "Invoice not found." };
          if (["draft", "void"].includes(inv.status)) return { status: "error", error: `Invoice ${inv.number} is ${inv.status}; send it before recording a payment.` };
          if (amount > Number(inv.balance_due) + 0.004) return { status: "error", error: `That's more than the balance due (${inv.balance_due}).` };
          const { data: row, error } = await sb.from("payments").insert({
            org_id: orgId, invoice_id: inv.id, amount, currency: inv.currency,
            payment_date: a.payment_date ?? new Date().toISOString().slice(0, 10),
            reference: a.reference ?? null, notes: a.notes ?? "Recorded by AI agent", created_by: userId ?? null,
          }).select("id,amount,payment_date").single();
          if (error) throw error;
          return { status: "ok", payment: row, link: `/app/invoices/${inv.id}` };
        }

        case "inventory_create_adjustment_request": {
          const delta = Number(a.quantity_delta ?? a.delta ?? a.quantity);
          if (!a.product_id || !a.warehouse_id || !delta) return { status: "error", error: "product_id, warehouse_id and a non-zero quantity_delta are needed." };
          // Runs only after a person approved it (this tool always needs approval).
          const { error } = await sb.rpc("apply_inventory_adjustment", {
            _org: orgId, _warehouse: a.warehouse_id, _product: a.product_id, _variant: null,
            _delta: delta, _reason: String(a.reason ?? "correction"), _notes: String(a.notes ?? "Proposed by AI agent"),
          });
          if (error) throw error;
          return { status: "ok", adjusted: delta, link: "/app/inventory/movements" };
        }

        case "project_summarize_status": {
          let pq = sb.from("projects").select("id,name,status,start_date,due_date,budget").eq("org_id", orgId);
          pq = a.project_id ? pq.eq("id", a.project_id) : pq.ilike("name", `%${String(a.project_name ?? "").replace(/[%,()*]/g, " ").trim()}%`);
          const { data: project, error } = await pq.limit(1).maybeSingle();
          if (error) throw error;
          if (!project) return { status: "error", error: "Project not found (project_id or project_name)." };
          const today = new Date().toISOString().slice(0, 10);
          const [{ data: tasks }, { data: hours }] = await Promise.all([
            sb.from("project_tasks").select("status,due_date").eq("org_id", orgId).eq("project_id", project.id),
            sb.from("timesheets").select("hours,billable").eq("org_id", orgId).eq("project_id", project.id),
          ]);
          const t = (tasks ?? []) as Array<{ status: string; due_date: string | null }>;
          const byStatus = t.reduce<Record<string, number>>((m, x) => ({ ...m, [x.status]: (m[x.status] ?? 0) + 1 }), {});
          const open = t.filter((x) => !["done", "cancelled"].includes(x.status));
          const h = (hours ?? []) as Array<{ hours: number; billable: boolean }>;
          return {
            status: "ok", project,
            tasks: { total: t.length, by_status: byStatus, overdue: open.filter((x) => x.due_date && x.due_date < today).length },
            done_pct: t.length ? Math.round(((byStatus.done ?? 0) / t.length) * 100) : 0,
            hours: { total: h.reduce((s, x) => s + Number(x.hours), 0), billable: h.filter((x) => x.billable).reduce((s, x) => s + Number(x.hours), 0) },
            link: `/app/projects/${project.id}`,
          };
        }

        case "task_update": {
          if (!a.task_id) return { status: "error", error: "Which task? (task_id)" };
          const upd: Record<string, unknown> = {};
          if (a.status && ["todo", "in_progress", "review", "done", "blocked", "cancelled"].includes(String(a.status))) {
            upd.status = a.status;
            upd.completed_at = a.status === "done" ? new Date().toISOString() : null;
          }
          if (a.due_date !== undefined) upd.due_date = a.due_date || null;
          if (a.assignee_id !== undefined) upd.assignee_id = a.assignee_id || null;
          if (a.priority && ["low", "medium", "high", "urgent"].includes(String(a.priority))) upd.priority = a.priority;
          if (!Object.keys(upd).length) return { status: "noop", reason: "nothing to change (status, due_date, assignee_id, priority)" };
          const { data: row, error } = await sb.from("project_tasks").update(upd).eq("id", a.task_id).eq("org_id", orgId)
            .select("id,title,status,due_date,project_id").maybeSingle();
          if (error) throw error;
          if (!row) return { status: "error", error: "Task not found." };
          return { status: "ok", task: row, link: `/app/projects/${row.project_id}?task=${row.id}` };
        }

        case "hr_search_employee_limited": {
          // Directory fields only: no pay, bank, birth date or address.
          const term = String(a.query ?? "").replace(/[%,()*]/g, " ").trim();
          let q = sb.from("employees").select("id,first_name,last_name,preferred_name,email,phone,status,start_date,departments:department_id(name),job_titles:job_title_id(name)").eq("org_id", orgId);
          if (term) q = q.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`);
          const { data: rows, error } = await q.order("first_name").limit(20);
          if (error) throw error;
          return { status: "ok", employees: rows ?? [] };
        }

        case "report_generate_sales_summary": {
          const { data: s, error } = await sb.rpc("module_summary", { _org: orgId, _module: "sales" });
          if (error) throw error;
          const { data: d } = await sb.rpc("dashboard_summary", { _org: orgId });
          return {
            status: "ok", invoiced_and_paid_by_month: s?.revenue, quotes_by_status: s?.quotes,
            open_pipeline: { value: d?.pipelineTotal, deals: d?.openDeals, by_stage: d?.pipeline },
            top_customers: d?.topCustomers, link: "/app/reports/sales",
          };
        }

        // For the /ai-stats command only (not in TOOL_REGISTRY, so agents and AI apps never get it).
        // Call logs are visible to owners and admins only (row-level security).
        case "ai_usage_stats": {
          const days = Math.min(Math.max(Number(a.days) || 30, 1), 90);
          const since = new Date(Date.now() - days * 86_400_000).toISOString();
          const { data: admin } = await sb.rpc("has_org_role", { _org: orgId, _roles: ["org_owner", "org_admin"] });
          if (!admin) return { status: "error", error: "AI stats are for workspace owners and admins." };
          const [calls, msgs, agentTools, proposed, agentActions, usage] = await Promise.all([
            sb.from("ai_call_logs").select("purpose,model,status,input_tokens,output_tokens,cached_tokens,duration_ms,cost_usd,source,error,created_at")
              .eq("org_id", orgId).gte("created_at", since).limit(5000),
            sb.from("ai_messages").select("metadata,model").eq("org_id", orgId).eq("role", "assistant").gte("created_at", since).limit(5000),
            sb.from("ai_agent_messages").select("metadata_json").eq("org_id", orgId).eq("role", "tool").gte("created_at", since).limit(5000),
            sb.from("ai_proposed_actions").select("status").eq("org_id", orgId).gte("created_at", since).limit(5000),
            sb.from("ai_agent_actions").select("status").eq("org_id", orgId).gte("created_at", since).limit(5000),
            sb.rpc("ai_usage_summary", { _org: orgId }),
          ]);
          type Call = { purpose: string; model: string; status: string; input_tokens: number | null; output_tokens: number | null; cached_tokens: number | null; duration_ms: number | null; cost_usd: number | null; error: string | null; created_at: string };
          // Why calls failed: the newest reason per model, so a fallback model's calls can be explained.
          const lastErrors: Record<string, { error: string; at: string }> = {};
          for (const c of (calls.data ?? []) as Call[]) {
            if (c.status === "completed" || !c.error) continue;
            if (!lastErrors[c.model] || c.created_at > lastErrors[c.model].at) lastErrors[c.model] = { error: c.error.slice(0, 160), at: c.created_at };
          }
          const byModel: Record<string, { calls: number; failed: number; input: number; output: number; cached: number; ms: number[]; cost: number; priced: boolean }> = {};
          for (const c of (calls.data ?? []) as Call[]) {
            const m = (byModel[c.model] ??= { calls: 0, failed: 0, input: 0, output: 0, cached: 0, ms: [], cost: 0, priced: false });
            m.calls++;
            if (c.status !== "completed") m.failed++;
            m.input += c.input_tokens ?? 0; m.output += c.output_tokens ?? 0; m.cached += c.cached_tokens ?? 0;
            if (c.duration_ms != null) m.ms.push(c.duration_ms);
            if (c.cost_usd != null) { m.cost += Number(c.cost_usd); m.priced = true; }
          }
          const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
          const tools: Record<string, { calls: number; ok: number }> = {};
          const count = (tool: string, ok: boolean) => { const t = (tools[tool] ??= { calls: 0, ok: 0 }); t.calls++; if (ok) t.ok++; };
          let commands = 0;
          for (const m of (msgs.data ?? []) as Array<{ metadata: any; model: string | null }>) {
            if (m.model === "command") commands++;
            for (const t of (m.metadata?.tool_calls ?? []) as Array<{ tool: string; ok: boolean }>) count(t.tool, t.ok);
          }
          for (const m of (agentTools.data ?? []) as Array<{ metadata_json: any }>) {
            if (m.metadata_json?.tool) count(m.metadata_json.tool, m.metadata_json.ok !== false);
          }
          const statuses = (rows: Array<{ status: string }> | null) =>
            (rows ?? []).reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
          return {
            status: "ok", days,
            models: Object.entries(byModel).map(([model, m]) => ({
              model, calls: m.calls, failed: m.failed, input_tokens: m.input, output_tokens: m.output, cached_tokens: m.cached,
              median_ms: median(m.ms), cost_usd: m.priced ? Number(m.cost.toFixed(4)) : null,
            })).sort((x, y) => y.calls - x.calls),
            tools: Object.entries(tools).map(([tool, t]) => ({ tool, calls: t.calls, ok: t.ok })).sort((x, y) => y.calls - x.calls),
            proposals: statuses(proposed.data), agent_actions: statuses(agentActions.data),
            commands, usage: usage.data ?? null,
            errors: Object.entries(lastErrors).map(([model, e]) => ({ model, error: e.error, at: e.at })),
          };
        }

        case "report_generate_cashflow_summary": {
          const { data: d, error } = await sb.rpc("dashboard_summary", { _org: orgId });
          if (error) throw error;
          const { data: bills } = await sb.from("vendor_bills").select("balance_due").eq("org_id", orgId).in("status", ["approved", "partially_paid", "overdue"]);
          return {
            status: "ok", cash_in_and_out_by_month: d?.cash,
            receivable: { outstanding: d?.outstanding, overdue_invoices: d?.overdue },
            payable: { unpaid_bills: (bills ?? []).reduce((s: number, b: { balance_due: number }) => s + Number(b.balance_due ?? 0), 0) },
            link: "/app/reports/accounting",
          };
        }

        case "notification_create": {
          const title = String(a.title ?? "").trim();
          if (!title) return { status: "error", error: "A title is needed." };
          if (a.user_id) {
            // Only to a member of this workspace.
            const { data: m } = await sb.from("memberships").select("user_id").eq("org_id", orgId).eq("user_id", a.user_id).eq("status", "active").maybeSingle();
            if (!m) return { status: "error", error: "That person isn't a member of this workspace." };
            const { notifyUsers } = await import("@/lib/notifications/notify.server");
            await notifyUsers(orgId, [String(a.user_id)], { kind: "agents.message", title, body: a.body ?? null, link: a.link ?? null, module: "agents" });
            return { status: "ok", notified: 1 };
          }
          const { error } = await notifyOrg(sb, orgId, { title, body: a.body ?? null, link: a.link ?? null, module: "agents" });
          if (error) throw new Error(error.message);
          return { status: "ok", notified: "everyone" };
        }

        case "quote_search": {
          let q = sb.from("quotes").select("id,number,status,total,currency,issue_date,expiry_date,companies:company_id(name)").eq("org_id", orgId);
          if (a.status) q = q.eq("status", a.status);
          const { data: rows, error } = await q.order("issue_date", { ascending: false }).limit(50);
          if (error) throw error;
          const who = String(a.customer ?? "").toLowerCase().trim();
          const list = (rows ?? []).filter((r: any) => !who || String(r.companies?.name ?? "").toLowerCase().includes(who)).slice(0, 20);
          return { status: "ok", quotes: list.map((r: any) => ({ ...r, customer: r.companies?.name ?? null, companies: undefined })), link: "/app/sales/quotes" };
        }

        case "payment_list": {
          const days = Math.min(366, Math.max(1, Number(a.days ?? 30) || 30));
          const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
          const { data: rows, error } = await sb.from("payments").select("id,amount,currency,payment_date,reference,invoices:invoice_id(number)")
            .eq("org_id", orgId).gte("payment_date", since).order("payment_date", { ascending: false }).limit(200);
          if (error) throw error;
          const list = (rows ?? []) as any[];
          return { status: "ok", days, count: list.length, total: list.reduce((n, r) => n + Number(r.amount ?? 0), 0),
            payments: list.slice(0, 20).map((r) => ({ ...r, invoice: r.invoices?.number ?? null, invoices: undefined })) };
        }

        case "project_list": {
          let q = sb.from("projects").select("id,name,code,status,due_date,budget,currency,companies:customer_company_id(name)").eq("org_id", orgId).eq("archived", false);
          if (a.status) q = q.eq("status", a.status);
          const term = String(a.query ?? "").replace(/[%,()*]/g, " ").trim();
          if (term) q = q.ilike("name", `%${term}%`);
          const { data: rows, error } = await q.order("due_date", { ascending: true, nullsFirst: false }).limit(30);
          if (error) throw error;
          return { status: "ok", projects: (rows ?? []).map((r: any) => ({ ...r, customer: r.companies?.name ?? null, companies: undefined })), link: "/app/projects" };
        }

        // For /agents (not in TOOL_REGISTRY): the workspace's agents, how they run and their last run.
        case "agent_list": {
          const { data: rows, error } = await sb.from("ai_agents").select("id,name,status,last_run_at,ai_agent_triggers(trigger_type,trigger_name,is_enabled)")
            .eq("org_id", orgId).neq("status", "archived").order("name").limit(50);
          if (error) throw error;
          return { status: "ok", agents: rows ?? [] };
        }

        // For /setup (not in TOOL_REGISTRY): the dashboard checklists' progress.
        case "workspace_setup": {
          const { data, error } = await sb.rpc("dashboard_overview", { _org: orgId });
          if (error) throw error;
          return { status: "ok", setup: (data as any)?.setup ?? {} };
        }

        // For /insights (not in TOOL_REGISTRY): platform owners only (the function refuses others).
        case "platform_insights": {
          const { data, error } = await sb.rpc("platform_insights", {});
          if (error) return { status: "error", error: "Only Inuberry platform owners can see platform insights." };
          return { status: "ok", ...(data as any) };
        }

        case "send_email": {
          const to = String(a.to ?? "").trim().toLowerCase();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { status: "error", error: "A valid email address is needed in 'to'." };
          const subject = String(a.subject ?? "").trim().slice(0, 200);
          const body = String(a.body ?? "").trim().slice(0, 20000);
          if (!subject || !body) return { status: "error", error: "The email needs a subject and a body." };
          const { data: allowed } = await sb.rpc("has_org_role", { _org: orgId, _roles: ["org_owner", "org_admin", "manager", "sales_rep", "accountant"] });
          if (allowed !== true) return { status: "error", error: "Your role can't send email outside the company." };
          const { loadOrgMailbox, sendSmtpEmail, smtpErrorMessage } = await loadMailer();
          const box = await loadOrgMailbox(orgId);
          if (!box) return { status: "error", error: "Connect the company mailbox in Settings › Email first; agents only send from it." };
          const { data: org } = await sb.from("organizations").select("name,email").eq("id", orgId).maybeSingle();
          const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          try {
            await sendSmtpEmail(box.smtp, {
              fromName: box.fromName || org?.name || "Inuberry", fromEmail: box.fromEmail, to,
              replyTo: box.replyTo || org?.email || null, subject,
              html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;white-space:pre-wrap">${esc(body)}</div>`,
              text: body,
            });
          } catch (e) {
            return { status: "error", error: `The email couldn't be sent: ${smtpErrorMessage(e)}` };
          }
          return { status: "ok", sent_to: to, subject };
        }

        case "team_chat_post": {
          const title = String(a.title ?? "").trim().slice(0, 200);
          if (!title) return { status: "error", error: "The message needs a title." };
          const { deliverToChannels } = await import("@/lib/comms/comms.functions");
          const delivered = await deliverToChannels(sb as never, orgId, { title, body: a.body ? String(a.body).slice(0, 4000) : undefined, link: a.link ? String(a.link) : undefined });
          if (!delivered) return { status: "error", error: "No Slack or Teams channel is set up (Communications › Channels), or none accepted the message." };
          return { status: "ok", delivered };
        }

        case "agent_create": {
          const { createAgentRecords } = await import("./agent-run.server");
          if (!userId) return { status: "error", error: "An agent can only be created for a signed-in person." };
          const agent = await createAgentRecords(sb, orgId, userId, a as never);
          return { status: "ok", agent, link: `/app/agents/${agent.id}` };
        }

        case "send_email_placeholder":
        case "call_webhook_placeholder":
        case "http_request_placeholder":
        case "external_api_lookup_placeholder":
        case "calendar_event_create_placeholder":
        case "slack_message_placeholder":
        case "mcp_tool_call_placeholder":
          return { status: "error", error: "This outside connection isn't set up yet, so the agent can't use it. Remove the tool from the agent or ask an admin to connect the service." };

        default:
          return { status: "not_implemented", tool: toolName };
      }
    } catch (e) {
      const obj = e as { message?: unknown; details?: unknown; hint?: unknown } | null;
      const msg = typeof obj?.message === "string" && obj.message
        ? obj.message
        : e instanceof Error ? e.message : (() => { try { return JSON.stringify(e); } catch { return String(e); } })();
      return { status: "error", error: msg };
    }
}
