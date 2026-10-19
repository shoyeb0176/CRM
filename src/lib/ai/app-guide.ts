// What the assistant (and AI apps through MCP inuberry_help) know about the app itself: where things
// are, how to do common tasks, and what common errors mean. Keep it short and true to the UI; links
// are /app/… paths. app-guide.test.ts fails when a sidebar or settings page is missing from it.
import { COMMANDS } from "./commands";

export const APP_GUIDE = `
APP MAP (sidebar groups → pages)
- Home: Dashboard /app (charts and key numbers), Inbox /app/inbox (AI approvals, open support tickets, notifications; tabs ?tab=approvals|support|notifications), Reports /app/reports
- Customers: CRM /app/crm (Companies /app/crm/companies, Contacts /app/crm/contacts, Leads /app/crm/leads, Deals /app/crm/deals board, Activities /app/crm/activities, Customers /app/customers: companies that buy, with balances and a 360° view); Support /app/support (staff inbox for customer portal tickets)
- Sales: Sales /app/sales (Quotes /app/sales/quotes, Sales orders), Invoices /app/invoices, Products /app/products (+ categories)
- Operations: Inventory /app/inventory (stock, warehouses, adjustments), Purchasing /app/purchasing (purchase orders, receipts, vendor bills, expenses), Suppliers /app/suppliers, Projects /app/projects (tasks board, milestones, timesheets)
- Finance & People: Accounting /app/accounting (chart of accounts, journal, P&L, balance sheet, settings), HR /app/hr (employees, departments, job titles, leave, attendance, US payroll at /app/hr/payroll)
- Automation: AI Agents /app/agents (create agents, chat with them; their approvals are in the Inbox), Automations /app/automations (workflows, and a link to the daily alerts), Forms /app/forms
- Workspace: Pages /app/workspace, Communications /app/comms, Databases /app/databases, Knowledge /app/knowledge (docs + ask your documents), Import data /app/import (CSV), Settings /app/settings, Billing /app/settings/billing
- Header: Search (Ctrl/⌘+K) jumps to any page or record and has Help actions (take the tour, show the checklists); Ask AI opens this assistant; the ? (Help) menu has Take the tour, Show Getting started, Show Your first sale, Guides, Report a problem and My reports; the bug icon reports a problem with a screenshot; the bell shows notifications (click one to open the exact record; the gear sets what you get). Sign out is at the bottom of the sidebar.
- Dashboard /app: number cards, charts, a Getting started checklist (company details, invite a teammate, first customer, connect an AI app) and a Your first sale checklist (customer, quote, send it, invoice, payment). Each step links to the right page and ticks itself off from real data. The X hides a card; Help (?) › Show Getting started / Show Your first sale brings it back; /setup in this panel shows the same progress.
- Platform admin /app/platform (Inuberry platform owners only): Overview, Customers (Organizations, Subscriptions, Demo, Support access), Pricing (Plans, Custom offerings, Sponsors: partner offers shown on Startup dashboards), Insights and logs (Insights /app/platform/insights: every person with email, sign-up and last sign-in, workspaces by plan, module use, how people heard about us and their profession, CSV export; Audit; Billing events), Feedback (Reports from Report a problem, Reviewers).
- Settings (menu in four groups): Workspace (Organization, Numbering, Notifications, Email), People and access (Members, Roles, Portal users, Support access, Audit log), Money (Billing, Taxes; tax rates live only here), AI and integrations (AI: what the AI may do on its own, models, your own key; Alert rules: daily alerts; Developer: AI apps, personal keys, API keys, webhooks).
- Create something: add ?new=1 to a list page to open its blank form, e.g. /app/crm/leads?new=1, /app/crm/deals?new=1, /app/crm/companies?new=1, /app/crm/contacts?new=1, /app/sales/quotes?new=1, /app/sales/orders?new=1, /app/invoices?new=1, /app/products?new=1, /app/purchasing/orders?new=1, /app/purchasing/bills?new=1, /app/purchasing/expenses?new=1, /app/suppliers?new=1, /app/projects?new=1, /app/hr/employees?new=1, /app/hr/payroll?new=1. The search box (Ctrl+K) lists these under Create.
- Each module has a guide at /docs/<name>: inbox, crm, sales, invoices, products-and-stock, purchasing, projects, accounting, hr, ai-agents, automations, workspace-tools, reports.
- Public guides: /docs/self-hosting (install on your own server), /docs/updates, /docs/mcp (connect AI apps), /docs/faq.

HOW TO (short)
- The tour: a short walk around the screen that dims everything except the part it explains. It starts by itself the first time you sign in (on a phone it shows the menu button and pins its card to the bottom); start it again from Help (?) › Take the tour, the dashboard's "Take the tour" link, the search box (Help › Take the tour) or by typing /tour here.
- Sign-up and onboarding: a new workspace asks its name, how you heard about Inuberry, what you do (your profession or kind of business), which modules to start with (suggested from what you do; only those show in the sidebar), and two size questions (people and yearly revenue) that decide whether the free Startup plan fits. Turn other modules on any time in Settings › Organization › Modules (owners and admins); each person can also hide modules from their own sidebar in Settings › Notifications › Your sidebar.
- New version: when Inuberry is updated while a tab is open, a message "A new version of Inuberry is ready" appears with Refresh; refreshing loads it (nothing is lost). Tabs on an old version that can't load a page reload once by themselves.
- Cookies and analytics: the banner asks once. "Accept all" allows anonymous Google Analytics on the public website and PostHog product analytics in the app (pages used, the user and workspace; never customers, invoices or other business records). "Necessary only" turns both off.
- Startup plan extras: Startup dashboards show up to three partner offers (sponsors); no workspace data is shared with them. Billing notes when a business is over both Startup limits (more than 15 people and over $100k revenue).
- First setup: Settings › Organization (profile + currency) → Accounting once (creates the chart of accounts) → Accounting › Settings: tick the "post automatically" boxes → Settings › Taxes → Settings › Email (connect the company mailbox).
- Invite a colleague: Settings › Members › Invite member (email + role). They get an email; the free plan allows up to 10 users.
- Add a lead: CRM › Leads › New lead. Convert it from the row menu ("Convert to contact & deal") to create a contact, company and deal.
- Sell: Sales › Quotes › New quote → Send → Convert to sales order → Invoice. Or Invoices › New invoice directly. Record payments on the invoice page.
- Email a quote or invoice: open it › Email. Needs a connected mailbox (Settings › Email).
- Stock: Products › New product (Track inventory ON) → Inventory › Adjust stock, or receive a purchase order (Purchasing › PO › Receive).
- Bills and expenses: Purchasing › Vendor bills / Expenses. With automatic posting on, they create journal entries.
- Projects: Projects › New project → tasks on the board; log time in timesheets.
- Files: every company, contact, quote, invoice, bill, supplier, employee and project page has an Attachments box (drop a file or click; up to 50 MB each).
- Import: Import data › drop a CSV › choose where it goes (companies, contacts, products, …) › Match columns › Import.
- Support tickets: Support › open a ticket › reply to the customer, or tick "Internal note" for a note only staff see; change status, priority and assignee on the right. Filter the list by status or "Assigned to me".
- Customer portal: Settings › Portal users › Add portal user (email + customer company). No email is sent: send the customer the link /portal/auth; they sign up there with that email.
- Notifications: the bell lists approvals, payments, alerts, tasks and security notices; the action button opens the exact record. Settings › Notifications turns each kind on or off, in the app and by email (security notices always come). Emails need a mailbox (Settings › Email) unless the install has its own.
- Connect an AI app (Claude, ChatGPT, Codex, Cursor): add https://crm.inuberry.com/mcp in the app, sign in, pick the workspace, Allow. Changes it asks for wait in Inbox › Approvals. Manage or disconnect apps and personal keys in Settings › Developer. Steps: /docs/mcp.
- Pricing: Startup is free (15 or fewer employees, or under $100k revenue), Startup Plus $12, Core $49, Growth $149, Business $349 a month, Enterprise from $999; no per-user fees; a year costs ten months. Details: /pricing.
- Self-host: needs a yearly licence (Core $590, Growth $1,790, Business $4,190); runs on your own server with Docker and a Supabase project; the admin gets a pop-up when a new version is out and installs it with one click. Steps: /docs/self-hosting and /docs/updates.
- Quick commands: typing / in this panel lists commands (${COMMANDS.map((c) => `/${c.name}${c.arg ? ` ${c.arg}` : ""}`).join(", ")}). Most answer instantly without the AI and use no AI actions (/new-agent starts a normal conversation); suggest them when they fit.
- AI agents: an agent does a job again and again, by hand, on a schedule (every hour, day, weekday or week at a set time) or when something happens (an invoice becomes overdue, a deal goes quiet, stock runs low, a task is overdue, a new lead, a form or support ticket, a quote answered, an invoice paid, a leave request). Three ways to make one: ask this assistant ("I want an agent that chases overdue invoices" or /new-agent …: it asks up to four questions, then shows the agent for you to approve), AI Agents › Templates /app/agents/templates, or AI Agents › New agent /app/agents/new (7 steps: basic info, instructions, data access, tools, when it runs, approval rules, review). Agents use the "AI agents" model in Settings › AI and one AI action per run. Schedules and events only run while the agent is Active (activate it on its page). Anything an agent wants to change, and every email it sends, waits in Inbox › Approvals. Run it by hand from its Chat tab; in this panel you can pick an agent at the top to talk to it. To remove one, Archive it (its history is kept). /agents lists them.
- Agent tools that reach outside: Send email (from the company mailbox in Settings › Email; always approved first) and Post to team chat (the Slack or Microsoft Teams channels in Communications). AI Agents › Connections shows which of these are ready; Gmail, Google Calendar, HubSpot, QuickBooks, Zapier, Make, custom APIs and MCP servers are marked coming soon.

COMMON PROBLEMS → FIX
- "Your plan has ended… read-only": the workspace's plan expired. Data can be read and exported, nothing can be changed. An owner/admin renews in Settings › Billing.
- "Connect your company mailbox in Settings › Email first": no mailbox yet. Settings › Email › choose provider (Gmail: use an App password from your Google account, 2-Step Verification on; Microsoft 365: smtp.office365.com, port 587, the admin may need to allow SMTP AUTH) › Save › Send test email.
- "You don't have permission to do that": the user's role can't do this action. An owner/admin can change roles in Settings › Members (see Settings › Roles for what each role allows).
- Can't invite more people: the plan's user limit is reached (free plan: 10). Remove inactive members or upgrade in Settings › Billing.
- Invoice lines locked: a sent invoice can't be edited; void it and duplicate it to correct it.
- Journal entry won't post: debits and credits must balance ("Off by …").
- Upload refused: files over 50 MB, or the plan's storage is full (Settings › Billing shows storage used).
- CSV import errors: the first row must be column headers; use Match columns to map them; dates as YYYY-MM-DD.
- AI says it's not configured or out of credit: Settings › AI (Test each row, or add your own provider key).
`.trim();


/** The guide as separate entries (heading + one line each), for keyword search (MCP inuberry_help). */
export function guideEntries() {
  let heading = "";
  const out: { title: string; text: string; url: string }[] = [];
  for (const line of APP_GUIDE.split("\n")) {
    if (!line.trim()) continue;
    if (!line.startsWith("- ")) { heading = line.trim(); continue; }
    const text = line.slice(2);
    const settings = text.match(/Settings › ([A-Z][a-z]+(?: [a-z]+)?)/)?.[1];
    const path = text.match(/\/(?:app|docs)[\w/-]*/)?.[0]
      ?? (settings ? `/app/settings/${settings.toLowerCase().replace(/ /g, "-")}` : "/docs/faq");
    out.push({ title: `${heading}: ${text.split(/[:.(]/)[0].slice(0, 60)}`, text, url: path });
  }
  return out;
}
