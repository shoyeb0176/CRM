// Assistant commands: a message that starts with "/" runs one fixed lookup and shows the result
// straight away. No AI model is called, so they're instant and don't use AI actions.
// The same list feeds the "/" menu in the assistant, the server, and the docs.

type Json = Record<string, any>;

export type SlashCommand = {
  name: string;
  /** What to type after the name, if anything. */
  arg?: string;
  description: string;
  /** The read tool it runs (none for /help). */
  tool?: string;
  args?: (rest: string) => Record<string, unknown>;
  format?: (result: Json, rest: string) => string;
  /** Runs in the browser instead (e.g. /tour starts the tour); nothing is sent. */
  client?: "tour";
  /** Sent to the assistant as this message instead (uses the AI as usual). */
  rewrite?: (rest: string) => string;
};

const num = (n: unknown) => Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const cell = (v: unknown) => String(v ?? "").replace(/\|/g, "/").replace(/\n/g, " ") || "—";
function table(head: string[], rows: unknown[][]): string {
  if (!rows.length) return "";
  return [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n");
}
const lastMonths = (rows: Json[] | null | undefined, n = 3): Json[] => (rows ?? []).slice(-n);

export const COMMANDS: SlashCommand[] = [
  {
    name: "sales", description: "Invoiced and paid in the last three months, the open pipeline and top customers.",
    tool: "report_generate_sales_summary",
    format: (r) => [
      "**Sales**",
      table(["Month", "Invoiced", "Paid"], lastMonths(r.invoiced_and_paid_by_month).map((m: Json) => [m.month, num(m.invoiced), num(m.paid)])),
      `Open pipeline: **${num(r.open_pipeline?.value)}** across ${num(r.open_pipeline?.deals)} deals.`,
      table(["Stage", "Value"], (r.open_pipeline?.by_stage ?? []).map((s: Json) => [s.stage, num(s.value)])),
      r.top_customers?.length ? `Top customers by paid: ${r.top_customers.map((c: Json) => `${c.name} (${num(c.value)})`).join(", ")}.` : "",
      "[Open the sales report](/app/reports/sales)",
    ].filter(Boolean).join("\n\n"),
  },
  {
    name: "cash", description: "Cash in and out by month, money owed to you, unpaid bills.",
    tool: "report_generate_cashflow_summary",
    format: (r) => [
      "**Cash**",
      table(["Month", "In", "Out"], lastMonths(r.cash_in_and_out_by_month).map((m: Json) => [m.month, num(m.in), num(m.out)])),
      `Owed to you: **${num(r.receivable?.outstanding)}** (${num(r.receivable?.overdue_invoices)} overdue invoices). Unpaid bills: **${num(r.payable?.unpaid_bills)}**.`,
      "[Open the accounting report](/app/reports/accounting)",
    ].join("\n\n"),
  },
  {
    name: "overdue", description: "Overdue invoices.",
    tool: "invoice_search", args: () => ({ status: "overdue" }),
    format: (r) => r.invoices?.length
      ? `**Overdue invoices**\n\n${table(["Invoice", "Due", "Balance"], r.invoices.map((i: Json) => [`[${i.number}](/app/invoices/${i.id})`, i.due_date, `${num(i.balance_due)} ${i.currency ?? ""}`]))}`
      : "No overdue invoices.",
  },
  {
    name: "low-stock", description: "Products that are low or out of stock.",
    tool: "inventory_low_stock",
    format: (r) => {
      const low: Json[] = r.products ?? [];
      return low.length
        ? `**Low or out of stock**\n\n${table(["Product", "SKU", "On hand", "Low at", ""], low.map((p) => [`[${p.name}](/app/products/${p.id})`, p.sku, num(p.on_hand), p.low_stock_threshold ?? "—", p.stock_status === "out" ? "out" : "low"]))}\n\n[Open products](/app/products)`
        : "Nothing is low or out of stock.";
    },
  },
  {
    name: "leads", arg: "[name or email]", description: "Newest leads, or the ones matching what you type.",
    tool: "crm_list_leads", args: (rest) => (rest ? { query: rest } : {}),
    format: (r, rest) => r.leads?.length
      ? `**Leads${rest ? ` matching "${rest}"` : ""}**\n\n${table(["Name", "Company", "Status", "Value"], r.leads.map((l: Json) => [l.name, l.company_name, l.status, l.estimated_value != null ? num(l.estimated_value) : ""]))}\n\n[Open leads](/app/crm/leads)`
      : `No leads${rest ? ` matching "${rest}"` : ""}.`,
  },
  {
    name: "crm", arg: "<name, company or email>", description: "Find contacts.",
    tool: "crm_search_contacts", args: (rest) => ({ query: rest }),
    format: (r, rest) => r.contacts?.length
      ? `**Contacts matching "${rest}"**\n\n${table(["Name", "Company", "Email", "Phone"], r.contacts.map((c: Json) => [`[${[c.first_name, c.last_name].filter(Boolean).join(" ")}](/app/crm/contacts/${c.id})`, c.companies?.name, c.email, c.phone]))}`
      : `No contacts matching "${rest}".`,
  },
  {
    name: "project", arg: "<project name>", description: "A project's tasks, overdue items and hours.",
    tool: "project_summarize_status", args: (rest) => ({ project_name: rest }),
    format: (r) => r.project
      ? [`**${r.project.name}** (${r.project.status}${r.project.due_date ? `, due ${r.project.due_date}` : ""})`,
         `${r.done_pct}% done: ${num(r.tasks?.total)} tasks, ${num(r.tasks?.overdue)} overdue. Hours logged: ${num(r.hours?.total)} (${num(r.hours?.billable)} billable).`,
         `[Open the project](${r.link})`].join("\n\n")
      : "Project not found.",
  },
  {
    name: "ai-stats", arg: "[days]", description: "How the AI is doing: calls, failures, speed, tokens, cache use, cost and tool success (owners and admins).",
    tool: "ai_usage_stats", args: (rest) => (/^\d+$/.test(rest) ? { days: Number(rest) } : {}),
    format: (r) => {
      const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
      const models: Json[] = r.models ?? [];
      const tools: Json[] = r.tools ?? [];
      const calls = models.reduce((s, m) => s + m.calls, 0);
      const failed = models.reduce((s, m) => s + m.failed, 0);
      const input = models.reduce((s, m) => s + m.input_tokens, 0);
      const cached = models.reduce((s, m) => s + m.cached_tokens, 0);
      const toolCalls = tools.reduce((s, t) => s + t.calls, 0);
      const toolOk = tools.reduce((s, t) => s + t.ok, 0);
      const priced = models.filter((m) => m.cost_usd != null);
      const cost = priced.reduce((s, m) => s + m.cost_usd, 0);
      const settled = (st: Json) => {
        const done = (st.executed ?? 0) + (st.approved ?? 0);
        const decided = done + (st.rejected ?? 0) + (st.failed ?? 0) + (st.cancelled ?? 0);
        return `${done} done, ${st.rejected ?? 0} turned down, ${st.failed ?? 0} failed, ${(st.pending ?? 0) + (st.pending_approval ?? 0)} waiting${decided ? ` (${pct(done, decided)} of decided ones went through)` : ""}`;
      };
      const u = r.usage as Json | null;
      return [
        `**AI over the last ${r.days} days**`,
        calls
          ? `${num(calls)} model calls, ${pct(calls - failed, calls)} answered (${num(failed)} failed or timed out). ${num(input)} tokens in, ${pct(cached, input)} of them from the provider's cache (cheaper). ${priced.length ? `Estimated cost **$${cost.toFixed(2)}**${priced.length < models.length ? " (models without a known price not included)" : ""}.` : "No price is known for these models, so no cost estimate."}`
          : "No AI model calls in this period.",
        table(["Model", "Calls", "Failed", "Median time", "Tokens in / out", "Cached", "Cost"], models.map((m) => [
          m.model, num(m.calls), num(m.failed), m.median_ms != null ? `${(m.median_ms / 1000).toFixed(1)} s` : "—",
          `${num(m.input_tokens)} / ${num(m.output_tokens)}`, pct(m.cached_tokens, m.input_tokens), m.cost_usd != null ? `$${m.cost_usd.toFixed(4)}` : "—",
        ])),
        toolCalls
          ? `**Tool calls:** ${num(toolCalls)}, ${pct(toolOk, toolCalls)} worked.\n\n${table(["Tool", "Calls", "Worked"], tools.slice(0, 12).map((t) => [t.tool, num(t.calls), pct(t.ok, t.calls)]))}`
          : "**Tool calls:** none recorded yet (they're recorded from version 1.13 on).",
        (r.errors ?? []).length
          ? `**Latest failure per model** (why a call failed or moved on to the next provider):\n\n${table(["Model", "When", "Reason"], (r.errors as Json[]).map((e) => [e.model, new Date(e.at).toLocaleString(), e.error]))}`
          : "",
        `**Changes the assistant proposed:** ${settled(r.proposals ?? {})}.`,
        `**Changes agents proposed:** ${settled(r.agent_actions ?? {})}.`,
        `Quick commands used: ${num(r.commands)} (no AI cost).`,
        u && u.limit != null ? `AI actions this month: ${num(u.used)} of ${num(u.limit)}.` : "",
      ].filter(Boolean).join("\n\n");
    },
  },
  {
    name: "quotes", arg: "[status]", description: "Latest quotes, or only draft, sent, accepted, rejected, expired or converted ones.",
    tool: "quote_search", args: (rest) => (rest ? { status: rest.toLowerCase() } : {}),
    format: (r, rest) => (r.quotes ?? []).length
      ? `**${rest ? `${rest[0].toUpperCase()}${rest.slice(1)} quotes` : "Latest quotes"}**\n\n${table(["Quote", "Customer", "Status", "Total", "Valid until"], (r.quotes as Json[]).map((q) => [q.number, q.customer, q.status, num(q.total), q.expiry_date]))}\n\n[Open quotes](/app/sales/quotes)`
      : `No ${rest ? `${rest} ` : ""}quotes yet. [New quote](/app/sales/quotes?new=1)`,
  },
  {
    name: "payments", arg: "[days]", description: "Payments received in the last 30 days (or as many days as you type).",
    tool: "payment_list", args: (rest) => ({ days: Number(rest) || 30 }),
    format: (r) => (r.payments ?? []).length
      ? `**Payments, last ${r.days} days:** ${num(r.total)} from ${num(r.count)} payment${r.count === 1 ? "" : "s"}.\n\n${table(["Date", "Invoice", "Amount", "Reference"], (r.payments as Json[]).map((p) => [p.payment_date, p.invoice, num(p.amount), p.reference]))}`
      : `No payments in the last ${r.days} days.`,
  },
  {
    name: "projects", arg: "[status or name]", description: "Projects with their status, customer and due date.",
    tool: "project_list",
    args: (rest) => (["planned", "active", "on_hold", "completed", "cancelled"].includes(rest.toLowerCase()) ? { status: rest.toLowerCase() } : rest ? { query: rest } : {}),
    format: (r) => (r.projects ?? []).length
      ? `${table(["Project", "Customer", "Status", "Due"], (r.projects as Json[]).map((p) => [p.name, p.customer, p.status, p.due_date]))}\n\nFor one project's tasks and hours: \`/project <name>\`. [Open projects](/app/projects)`
      : "No projects found. [New project](/app/projects?new=1)",
  },
  {
    name: "agents", description: "Your AI agents: whether they're on, when they run and their last run.",
    tool: "agent_list",
    format: (r) => (r.agents ?? []).length
      ? `${table(["Agent", "Status", "Runs", "Last run"], (r.agents as Json[]).map((a) => [
          `[${a.name}](/app/agents/${a.id})`, a.status,
          ((a.ai_agent_triggers ?? []) as Json[]).filter((t) => t.is_enabled).map((t) => t.trigger_name).join("; ") || "When you run it",
          a.last_run_at ? new Date(a.last_run_at).toLocaleString() : "never"]))}\n\nScheduled and event runs only happen while an agent is active. Want another? Type \`/new-agent\` and what it should do.`
      : "No agents yet. Type `/new-agent` and what it should do (for example `/new-agent chase overdue invoices every Monday`), or start from [a template](/app/agents/templates).",
  },
  {
    name: "new-agent", arg: "[what it should do]", description: "Set up an AI agent with the assistant: it asks a few questions, then shows the agent for you to approve.",
    rewrite: (rest) => `I want to set up an AI agent${rest ? ` that will ${rest.replace(/^(that|to)\s+/i, "")}` : ""}. Ask me what you need to know, one question at a time, then propose it.`,
  },
  {
    name: "setup", description: "Where you are with Getting started and Your first sale, with a link for each step.",
    tool: "workspace_setup",
    format: (r) => {
      const s = r.setup ?? {};
      const tick = (done: boolean, label: string, to: string) => `- ${done ? "✓" : "○"} [${label}](${to})`;
      return [
        "**Getting started**",
        tick(!!s.details, "Add your company details", "/app/settings/organization"),
        tick((s.members ?? 0) > 1, "Invite a teammate", "/app/settings/members"),
        tick((s.companies ?? 0) > 0, "Add your first customer", "/app/crm/companies"),
        tick((s.apps ?? 0) > 0, "Connect your AI app", "/app/settings/developer"),
        "",
        "**Your first sale**",
        tick((s.companies ?? 0) > 0, "Add a customer", "/app/crm/companies?new=1"),
        tick((s.quotes ?? 0) > 0, "Write a quote", "/app/sales/quotes?new=1"),
        tick((s.sentQuotes ?? 0) > 0, "Send it", "/app/sales/quotes"),
        tick((s.invoices ?? 0) > 0, "Turn it into an invoice", "/app/invoices"),
        tick((s.payments ?? 0) > 0, "Record the payment", "/app/invoices"),
        "",
        "Closed a card on the dashboard? Bring it back from Help (the ? in the top bar).",
      ].join("\n");
    },
  },
  { name: "tour", description: "Start the short tour of the screen again.", client: "tour" },
  {
    name: "insights", description: "Platform owners: people, active users, sign-ups and how people found Inuberry.",
    tool: "platform_insights",
    format: (r) => {
      const t = r.totals ?? {};
      const top = (rows: Json[] | undefined, key: string) => (rows ?? []).slice(0, 5).map((x) => `${x[key] ?? "Not said"} (${num(x.people)})`).join(", ");
      return [
        `**People:** ${num(t.users)} · active this week ${num(t.active_7d)} · this month ${num(t.active_30d)} · sign-ups in 30 days ${num(t.signups_30d)}`,
        `**Workspaces:** ${num(t.workspaces)}, ${num(t.workspaces_active_30d)} active this month`,
        r.heard_about?.length ? `**How they heard about us:** ${top(r.heard_about, "source")}` : "",
        r.professions?.length ? `**What they do:** ${top(r.professions, "profession")}` : "",
        "[Open Platform › Insights](/app/platform/insights)",
      ].filter(Boolean).join("\n\n");
    },
  },
  { name: "help", description: "List these commands." },
];

export function helpText(): string {
  return [
    "**Commands** (instant, and they don't use AI actions):",
    ...COMMANDS.map((c) => `- \`/${c.name}${c.arg ? ` ${c.arg}` : ""}\`: ${c.description}`),
    "Anything else you type goes to the assistant as usual.",
  ].join("\n");
}

/** The command a message asks for, or null when it's a normal message. */
export function parseCommand(message: string): { command: SlashCommand | null; name: string; rest: string } | null {
  const m = /^\/([a-z][a-z-]*)(?:\s+([\s\S]*))?$/i.exec(message.trim());
  if (!m) return null;
  const name = m[1].toLowerCase();
  return { command: COMMANDS.find((c) => c.name === name) ?? null, name, rest: (m[2] ?? "").trim() };
}

/** The reply for a command, given a way to run read tools. */
export async function runCommand(
  parsed: NonNullable<ReturnType<typeof parseCommand>>,
  runTool: (tool: string, args: Record<string, unknown>) => Promise<Json>,
): Promise<string> {
  const { command, name, rest } = parsed;
  if (!command) return `There's no \`/${name}\` command.\n\n${helpText()}`;
  if (command.client === "tour") return "The tour starts from the ? (Help) in the top bar, or type /tour in the assistant panel.";
  if (!command.tool || !command.format) return helpText();
  if (command.arg?.startsWith("<") && !rest) return `Add what to look for: \`/${command.name} ${command.arg}\``;
  const result = await runTool(command.tool, command.args?.(rest) ?? {});
  if (result?.status === "error") return String(result.error ?? "That didn't work.");
  return command.format(result, rest);
}
