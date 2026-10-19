// Short guides to each part of the app, at /docs/<slug>. Each module's page links here from the
// line under its title (PAGE_HELP in src/components/app/nav.ts). Same body format as content.ts.
import type { Doc } from "./content";
import { COMMANDS } from "@/lib/ai/commands";

const A = "People using Inuberry";

export const MODULE_DOCS: Doc[] = [
  {
    slug: "inbox", title: "Inbox", audience: A,
    summary: "Everything waiting on you: AI requests to approve, open support tickets and notifications.",
    sections: [
      { id: "what", heading: "What it's for", body: `One place to clear what needs you. The sidebar badge counts AI requests waiting for approval plus support tickets nobody has picked up.

- **Approvals:** changes the assistant, an AI agent or a connected AI app wants to make. Open **Details** to see exactly what will be saved, then Approve or Reject.
- **Support:** open tickets from the customer portal, unassigned first.
- **Notifications:** everything you were notified about, with filters and Mark all read.` },
      { id: "rules", heading: "Let the AI do more on its own", body: `In [Settings › AI](/app/settings/ai) choose, per kind of change, whether the AI may never do it, only draft it, ask first (the default) or do it automatically. AI agents have their own approval setting on each agent.` },
    ],
  },
  {
    slug: "crm", title: "CRM", audience: A,
    summary: "Companies, contacts, leads, deals and activities: who you sell to and where each deal stands.",
    sections: [
      { id: "what", heading: "What it's for", body: `Keep every company and person you deal with in one place, track leads until they become deals, and move deals through your pipeline. The **Customers** tab lists companies that buy from you, with what they owe.` },
      { id: "first", heading: "First steps", body: `1. Add a company (CRM › Companies › New) or import a CSV from [Import data](/app/import).
2. Add the people you talk to there (Contacts).
3. Log new interest as a lead; when it's real, turn it into a deal.
4. Drag deals across the board as they progress, and log calls, emails and meetings as activities.` },
      { id: "tips", heading: "Good to know", body: `- Deals untouched for a while trigger a daily alert (Settings › Alert rules).
- The assistant can summarise a company or deal: open it and click Ask AI.
- A company page has a link to its quotes, orders and invoices.` },
    ],
  },
  {
    slug: "sales", title: "Sales: quotes, orders and payments", audience: A,
    summary: "Quote a price, turn it into an order, invoice it and record payments.",
    sections: [
      { id: "what", heading: "What it's for", body: `The path from price to cash: a **quote** the customer can accept in the portal, a **sales order** once they agree, an **invoice** to bill them and **payments** against it.` },
      { id: "first", heading: "First steps", body: `1. Set your tax rates in [Settings › Taxes](/app/settings/taxes) and number formats in Settings › Numbering.
2. Add products (Products) so lines fill in their price.
3. Create a quote, send it by email or share the portal link.
4. Convert it to an order and an invoice, then record payments as they arrive.` },
      { id: "tips", heading: "Good to know", body: `- Customers can accept or decline a quote in the customer portal, and you get a notification.
- Send documents from your own mailbox once [Settings › Email](/app/settings/email) is set up.` },
    ],
  },
  {
    slug: "invoices", title: "Invoices", audience: A,
    summary: "Bill customers, send invoices, record payments and see what's overdue.",
    sections: [
      { id: "what", heading: "What it's for", body: `Every invoice with its status (draft, sent, partly paid, paid, overdue) and balance. Paid and overdue invoices notify the owner and accountant.` },
      { id: "first", heading: "First steps", body: `1. Create an invoice, or convert one from a sales order.
2. Send it by email or print it to PDF.
3. Record each payment; the balance and status update themselves.` },
      { id: "tips", heading: "Good to know", body: `- Invoices past their due date are marked overdue every night.
- Payments post to accounting automatically when accounting is set up.` },
    ],
  },
  {
    slug: "products-and-stock", title: "Products and stock", audience: A,
    summary: "Your catalogue, stock levels per warehouse, movements and reorder alerts.",
    sections: [
      { id: "what", heading: "What it's for", body: `**Products** holds what you sell or buy: price, cost, SKU and barcode. **Inventory** shows how many you have in each warehouse, every movement in and out, and what needs reordering.` },
      { id: "first", heading: "First steps", body: `1. Add products (or import them) and turn on stock tracking where it matters.
2. Add your warehouses under Inventory › Warehouses.
3. Receive stock through a purchase order, or set opening counts with an adjustment.` },
      { id: "tips", heading: "Good to know", body: `- Products at or below their reorder level trigger a daily low-stock alert.
- Products export to CSV from the Products page.` },
    ],
  },
  {
    slug: "purchasing", title: "Purchasing and suppliers", audience: A,
    summary: "Buy from suppliers: purchase orders, receiving, bills and expenses.",
    sections: [
      { id: "what", heading: "What it's for", body: `Order from **suppliers** with purchase orders, receive the goods into stock, record the supplier's **bill** and pay it. Day-to-day spending goes in **expenses**.` },
      { id: "first", heading: "First steps", body: `1. Add your suppliers.
2. Create a purchase order and send it.
3. Receive it when the goods arrive; stock goes up.
4. Enter the bill and mark it paid.` },
    ],
  },
  {
    slug: "projects", title: "Projects", audience: A,
    summary: "Projects with tasks, milestones and timesheets.",
    sections: [
      { id: "what", heading: "What it's for", body: `Plan work as projects, split it into tasks on a board, mark milestones and log time against tasks.` },
      { id: "first", heading: "First steps", body: `1. Create a project, optionally for a customer.
2. Add tasks, assign them and set due dates. People are notified when a task is assigned to them.
3. Log hours under Projects › Timesheets.` },
      { id: "tips", heading: "Good to know", body: `- Late tasks show up in the daily alerts.
- Customers can follow their projects in the customer portal.` },
    ],
  },
  {
    slug: "accounting", title: "Accounting", audience: A,
    summary: "Chart of accounts, journal entries and the main reports: profit and loss, balance sheet, trial balance.",
    sections: [
      { id: "what", heading: "What it's for", body: `Double-entry books for the business. Invoices, bills, payments and expenses post here automatically once the default accounts are set; you can also add manual journal entries.` },
      { id: "first", heading: "First steps", body: `1. Check the chart of accounts and add any accounts you need.
2. In Accounting › Settings pick the default accounts used for automatic postings.
3. Read profit and loss, the balance sheet and the trial balance under Accounting.` },
    ],
  },
  {
    slug: "hr", title: "HR", audience: A,
    summary: "Employees, departments, job titles, leave, attendance and US payroll.",
    sections: [
      { id: "what", heading: "What it's for", body: `A record for each employee (role, department, manager, documents, pay details for HR only), plus leave requests, attendance and US pay runs.` },
      { id: "first", heading: "First steps", body: `1. Add departments and job titles.
2. Add employees, or import them.
3. Employees request leave; managers approve it and both are notified.` },
      { id: "tips", heading: "Good to know", body: `- Pay details are visible only to owners, admins and HR.` },
      { id: "payroll", heading: "Run US payroll", body: `1. On each employee's page, fill in **Payroll profile**: salary or hourly rate, pay frequency, and the numbers from their W-4 (filing status, Step 2 box, Steps 3 and 4), a flat state tax rate, and any pre-tax 401(k) or health deduction.
2. [HR › Payroll](/app/hr/payroll) › **New pay run**: pick the period and pay date. Every active employee with a payroll profile gets a line with federal income tax (IRS Publication 15-T 2026), Social Security, Medicare and state tax worked out.
3. Change hours or gross pay on any line (a bonus, overtime) and the taxes are worked out again.
4. **Approve**: the lines are locked and Accounting gets one entry: wages and employer taxes as expenses, taxes, deductions and net pay as amounts owed.
5. Pay your people through your bank, then **Mark paid**: net pay comes out of cash.
6. **Pay slips** prints one slip per employee, or save it as a PDF.

Not included: filing 941 or W-2 forms, paying tax deposits, direct deposit, state tax tables or wage garnishments. Owners, admins and HR managers can run payroll; if an HR manager approves, an accountant or owner posts the journal entry.` },
    ],
  },
  {
    slug: "ai-agents", title: "AI agents", audience: A,
    summary: "Assistants you set up for a job, with the modules and tools they may use.",
    sections: [
      { id: "what", heading: "What it's for", body: `An agent is an AI set up for one job, such as following up leads or checking stock. You choose what it can read and change, and which tools it may call.` },
      { id: "first", heading: "First steps", body: `1. AI agents › New agent, or start from a template.
2. On **Data access**, tick only what it needs (the All column ticks a whole row).
3. Pick its tools and whether changes need approval.
4. Talk to it from its Chat tab, or pick it at the top of the assistant panel.` },
      { id: "tips", heading: "Good to know", body: `- Anything an agent wants to change waits in [Inbox › Approvals](/app/inbox) unless you allowed it to act alone.
- Archive an agent to stop it; its history is kept.` },
      { id: "commands", heading: "Quick commands in the assistant", body: `Type **/** in the assistant to pick one. They look things up straight away, without the AI, so they are instant and don't use AI actions.

${COMMANDS.map((c) => `- \`/${c.name}${c.arg ? ` ${c.arg}` : ""}\`: ${c.description}`).join("\n")}

Anything that doesn't start with / goes to the assistant as a normal question.` },
    ],
  },
  {
    slug: "automations", title: "Automations", audience: A,
    summary: "Workflows that react to events, and daily alerts.",
    sections: [
      { id: "what", heading: "What it's for", body: `**Workflows** run when something happens (a deal is won, an invoice is paid) and do something: notify someone, create a task, update a record. **Daily alerts** check every morning for overdue invoices, low stock, stale deals and late tasks.` },
      { id: "first", heading: "First steps", body: `1. Automations › pick a template or start from scratch.
2. Choose the trigger, add conditions and actions, and turn it on.
3. Tune the daily alerts in [Settings › Alert rules](/app/settings/automations).` },
    ],
  },
  {
    slug: "workspace-tools", title: "Pages, databases and knowledge", audience: A,
    summary: "Team notes, simple custom tables and documents the AI can answer from.",
    sections: [
      { id: "what", heading: "What it's for", body: `- **Pages:** shared notes and procedures.
- **Databases:** simple tables for anything the other modules don't cover.
- **Knowledge:** upload documents, then ask questions about them.
- **Communications:** every email, meeting and call with a customer, in one timeline.
- **Import data:** bring in CSV files.` },
    ],
  },
  {
    slug: "reports", title: "Reports", audience: A,
    summary: "Sales, CRM, inventory, purchasing, projects and accounting reports.",
    sections: [
      { id: "what", heading: "What it's for", body: `Ready-made reports for each module: revenue by month and top customers, pipeline and win rate, stock value and movements, supplier spend, hours by project, and the accounting statements. Pick a date range at the top.` },
    ],
  },
];
