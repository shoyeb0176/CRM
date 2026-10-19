// The app's navigation, in one place: the sidebar, the command palette and the breadcrumbs read it.
import {
  BarChart3, Inbox, BookOpen, Bot, Boxes, Briefcase, ClipboardList, CreditCard, FileText,
  Handshake, Landmark, LayoutDashboard, LifeBuoy, type LucideIcon, Mail, Package, Receipt, Settings,
  ShoppingBasket, ShoppingCart, Table2, Truck, Upload, Users, Workflow, Bug } from "lucide-react";

import { moduleAccess, type ModuleKey } from "@/lib/settings/role-matrix";

export type Attention = "approvals" | "support" | "inbox";
export type NavItem = { label: string; to: string; icon: LucideIcon; badge?: Attention };

/** Parts of the app a workspace can switch off (organizations.enabled_modules; NULL = all). */
export type WorkspaceModule = "crm" | "sales" | "invoices" | "inventory" | "purchasing" | "projects" | "accounting" | "hr" | "ai" | "workspace";
export const WORKSPACE_MODULES: Array<{ key: WorkspaceModule; label: string; desc: string }> = [
  { key: "crm", label: "CRM and support", desc: "Companies, contacts, leads, deals, customer tickets" },
  { key: "sales", label: "Sales", desc: "Quotes, sales orders, payments" },
  { key: "invoices", label: "Invoices", desc: "Bill customers and track what they owe" },
  { key: "inventory", label: "Products and stock", desc: "Catalogue, warehouses, stock levels" },
  { key: "purchasing", label: "Purchasing", desc: "Suppliers, purchase orders, bills, expenses" },
  { key: "projects", label: "Projects", desc: "Tasks, milestones, timesheets" },
  { key: "accounting", label: "Accounting", desc: "Accounts, journal, financial statements" },
  { key: "hr", label: "HR", desc: "Employees, leave, attendance" },
  { key: "ai", label: "AI agents and automations", desc: "Agents, workflows, forms" },
  { key: "workspace", label: "Pages and knowledge", desc: "Team pages, databases, documents, communications" },
];
// Which module a page belongs to, by path. Pages not listed (home, inbox, reports, settings) always show.
const MODULE_PATHS: Array<[string, WorkspaceModule]> = [
  ["/app/crm", "crm"], ["/app/customers", "crm"], ["/app/support", "crm"],
  ["/app/sales", "sales"], ["/app/invoices", "invoices"],
  ["/app/products", "inventory"], ["/app/inventory", "inventory"],
  ["/app/purchasing", "purchasing"], ["/app/suppliers", "purchasing"],
  ["/app/projects", "projects"], ["/app/accounting", "accounting"], ["/app/hr", "hr"],
  ["/app/agents", "ai"], ["/app/automations", "ai"], ["/app/forms", "ai"],
  ["/app/workspace", "workspace"], ["/app/databases", "workspace"], ["/app/knowledge", "workspace"], ["/app/comms", "workspace"],
];
// Pages per module in the role matrix (Settings › Roles): a role with no access to a module
// doesn't see its pages in the sidebar, search or dashboard. The database still decides access.
const ROLE_PATHS: Array<[string, ModuleKey]> = [
  ["/app/crm", "crm"], ["/app/sales", "sales"], ["/app/invoices", "invoices"],
  ["/app/products", "inventory"], ["/app/inventory", "inventory"],
  ["/app/purchasing", "purchasing"], ["/app/suppliers", "purchasing"],
  ["/app/projects", "projects"], ["/app/accounting", "accounting"], ["/app/hr", "hr"], ["/app/reports", "reports"],
];
/**
 * False when the page's module is switched off for this workspace, the role has no access to it,
 * or the person hid it from their own sidebar (`hidden`, Settings › Notifications › Your sidebar).
 */
export function moduleShown(path: string, enabled: string[] | null | undefined, role?: string | null, hidden?: readonly string[]) {
  const p = path.split("?")[0];
  const match = <T,>(list: Array<[string, T]>) => list.find(([prefix]) => p === prefix || p.startsWith(prefix + "/"));
  const hit = match(MODULE_PATHS);
  if (enabled && hit && !enabled.includes(hit[1])) return false;
  if (hidden && hit && hidden.includes(hit[1])) return false;
  const roleHit = role ? match(ROLE_PATHS) : undefined;
  return !roleHit || moduleAccess(role, roleHit[1]) !== "none";
}
export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  { label: "Home", items: [
    { label: "Dashboard", to: "/app", icon: LayoutDashboard },
    { label: "Inbox", to: "/app/inbox", icon: Inbox, badge: "inbox" },
    { label: "Reports", to: "/app/reports", icon: BarChart3 },
  ] },
  { label: "Customers & sales", items: [
    { label: "CRM", to: "/app/crm", icon: Handshake },
    { label: "Support", to: "/app/support", icon: LifeBuoy, badge: "support" },
    { label: "Sales", to: "/app/sales", icon: ShoppingCart },
    { label: "Invoices", to: "/app/invoices", icon: Receipt },
  ] },
  { label: "Operations", items: [
    { label: "Products", to: "/app/products", icon: Package },
    { label: "Inventory", to: "/app/inventory", icon: Boxes },
    { label: "Purchasing", to: "/app/purchasing", icon: ShoppingBasket },
    { label: "Suppliers", to: "/app/suppliers", icon: Truck },
    { label: "Projects", to: "/app/projects", icon: Briefcase },
  ] },
  { label: "Finance & people", items: [
    { label: "Accounting", to: "/app/accounting", icon: Landmark },
    { label: "HR", to: "/app/hr", icon: Users },
  ] },
  { label: "AI & automation", items: [
    { label: "AI agents", to: "/app/agents", icon: Bot },
    { label: "Automations", to: "/app/automations", icon: Workflow },
    { label: "Forms", to: "/app/forms", icon: ClipboardList },
  ] },
  { label: "Workspace", items: [
    { label: "Pages", to: "/app/workspace", icon: FileText },
    { label: "Databases", to: "/app/databases", icon: Table2 },
    { label: "Knowledge", to: "/app/knowledge", icon: BookOpen },
    { label: "Communications", to: "/app/comms", icon: Mail },
    { label: "Import data", to: "/app/import", icon: Upload },
  ] },
];

/** Pinned at the bottom of the sidebar. */
export const NAV_FOOTER: NavItem[] = [
  { label: "Settings", to: "/app/settings", icon: Settings },
  { label: "Billing", to: "/app/settings/billing", icon: CreditCard },
];

/** Pages inside modules, for the command palette ("Go to"). */
export const SUB_PAGES: Array<{ label: string; to: string }> = [
  { label: "CRM · Companies", to: "/app/crm/companies" }, { label: "CRM · Contacts", to: "/app/crm/contacts" },
  { label: "CRM · Leads", to: "/app/crm/leads" }, { label: "CRM · Deals", to: "/app/crm/deals" },
  { label: "CRM · Activities", to: "/app/crm/activities" }, { label: "CRM · Customers", to: "/app/customers" },
  { label: "Sales · Quotes", to: "/app/sales/quotes" }, { label: "Sales · Orders", to: "/app/sales/orders" },
  { label: "Sales · Payments", to: "/app/sales/payments" },
  { label: "Products · Categories", to: "/app/products/categories" },
  { label: "Inventory · Warehouses", to: "/app/inventory/warehouses" }, { label: "Inventory · Stock movements", to: "/app/inventory/movements" },
  { label: "Inventory · Adjustments", to: "/app/inventory/adjustments" },
  { label: "Purchasing · Purchase orders", to: "/app/purchasing/orders" }, { label: "Purchasing · Bills", to: "/app/purchasing/bills" },
  { label: "Purchasing · Expenses", to: "/app/purchasing/expenses" },
  { label: "Projects · Timesheets", to: "/app/projects/timesheets" },
  { label: "Accounting · Chart of accounts", to: "/app/accounting/coa" }, { label: "Accounting · Journal", to: "/app/accounting/journal" },
  { label: "Accounting · Profit & loss", to: "/app/accounting/pnl" }, { label: "Accounting · Balance sheet", to: "/app/accounting/balance" },
  { label: "Accounting · Trial balance", to: "/app/accounting/trial" }, { label: "Accounting · General ledger", to: "/app/accounting/ledger" },
  { label: "HR · Employees", to: "/app/hr/employees" }, { label: "HR · Leave", to: "/app/hr/leave" },
  { label: "HR · Attendance", to: "/app/hr/attendance" }, { label: "HR · Departments", to: "/app/hr/departments" },
  { label: "HR · Payroll", to: "/app/hr/payroll" },
  { label: "My reports (problems and ideas sent to Inuberry)", to: "/app/feedback" },
  { label: "AI agents · New agent", to: "/app/agents/new" }, { label: "Inbox · Approvals", to: "/app/inbox?tab=approvals" },
  { label: "AI agents · Runs", to: "/app/agents/runs" },
  { label: "Inbox · Notifications", to: "/app/inbox?tab=notifications" }, { label: "Inbox · Support", to: "/app/inbox?tab=support" },
];

/**
 * The line under a module's title: what the page is for, and its guide at /docs/<doc>.
 * Shown on module and list pages (exact path), not on record pages.
 */
const HELP: Array<[paths: string[], text: string, doc?: string]> = [
  [["/app/inbox"], "Everything waiting on you: AI requests to approve, open support tickets and notifications.", "inbox"],
  [["/app/crm", "/app/crm/companies", "/app/crm/contacts", "/app/crm/leads", "/app/crm/deals", "/app/crm/activities", "/app/customers"],
    "Who you sell to and where each deal stands: companies, contacts, leads, deals and activities.", "crm"],
  [["/app/support"], "Tickets your customers open in the customer portal. Assign them, reply and close them here.", "inbox"],
  [["/app/sales", "/app/sales/quotes", "/app/sales/orders", "/app/sales/payments"], "From price to cash: quotes, sales orders and payments.", "sales"],
  [["/app/invoices"], "Bill customers, send invoices and record payments. Overdue ones are flagged every night.", "invoices"],
  [["/app/products", "/app/products/categories"], "What you sell or buy: prices, costs, SKUs and stock tracking.", "products-and-stock"],
  [["/app/inventory", "/app/inventory/warehouses", "/app/inventory/movements", "/app/inventory/adjustments"], "Stock in each warehouse, every movement, and what needs reordering.", "products-and-stock"],
  [["/app/purchasing", "/app/purchasing/orders", "/app/purchasing/bills", "/app/purchasing/expenses", "/app/purchasing/categories", "/app/suppliers"],
    "Buying from suppliers: purchase orders, receiving, bills and expenses.", "purchasing"],
  [["/app/projects", "/app/projects/timesheets"], "Projects with tasks, milestones and the time spent on them.", "projects"],
  [["/app/accounting", "/app/accounting/coa", "/app/accounting/journal", "/app/accounting/ledger", "/app/accounting/pnl", "/app/accounting/balance", "/app/accounting/trial", "/app/accounting/settings"],
    "Your books: accounts, journal entries and the main statements. Invoices, bills and payments post here on their own.", "accounting"],
  [["/app/hr", "/app/hr/employees", "/app/hr/leave", "/app/hr/attendance", "/app/hr/departments", "/app/hr/titles"], "Employees, departments, leave and attendance.", "hr"],
  [["/app/hr/payroll"], "US pay runs: work out pay and taxes, approve, record them in Accounting, print pay slips.", "hr"],
  [["/app/agents", "/app/agents/list", "/app/agents/templates", "/app/agents/runs", "/app/agents/tools", "/app/agents/connections"],
    "AI set up for one job each, with the data and tools you allow.", "ai-agents"],
  [["/app/automations"], "Workflows that react to events, and the daily alerts.", "automations"],
  [["/app/forms"], "Shareable forms that turn each response into a lead or a database record."],
  [["/app/workspace", "/app/databases", "/app/knowledge", "/app/comms", "/app/import"], "Team pages, custom tables, documents the AI can answer from, and imports.", "workspace-tools"],
  [["/app/reports", "/app/reports/sales", "/app/reports/crm", "/app/reports/inventory", "/app/reports/purchasing", "/app/reports/projects", "/app/reports/accounting"],
    "Ready-made reports for each module. Pick a date range at the top.", "reports"],
];
const HELP_BY_PATH = new Map(HELP.flatMap(([paths, text, doc]) => paths.map((p) => [p, { text, doc }] as const)));
export const pageHelp = (pathname: string) => HELP_BY_PATH.get(pathname.replace(/\/+$/, ""));

/** "New …" shortcuts: each opens the module's blank form (?new=1, see useOpenOnNew). */
export const NEW_ACTIONS: Array<{ label: string; to: string; icon: LucideIcon }> = [
  { label: "New lead", to: "/app/crm/leads?new=1", icon: Handshake },
  { label: "New deal", to: "/app/crm/deals?new=1", icon: Handshake },
  { label: "New company", to: "/app/crm/companies?new=1", icon: Handshake },
  { label: "New contact", to: "/app/crm/contacts?new=1", icon: Users },
  { label: "New quote", to: "/app/sales/quotes?new=1", icon: ShoppingCart },
  { label: "New sales order", to: "/app/sales/orders?new=1", icon: ShoppingCart },
  { label: "New invoice", to: "/app/invoices?new=1", icon: Receipt },
  { label: "New product", to: "/app/products?new=1", icon: Package },
  { label: "New purchase order", to: "/app/purchasing/orders?new=1", icon: ShoppingBasket },
  { label: "New bill", to: "/app/purchasing/bills?new=1", icon: ShoppingBasket },
  { label: "New expense", to: "/app/purchasing/expenses?new=1", icon: ShoppingBasket },
  { label: "New supplier", to: "/app/suppliers?new=1", icon: Truck },
  { label: "New project", to: "/app/projects?new=1", icon: Briefcase },
  { label: "New employee", to: "/app/hr/employees?new=1", icon: Users },
  { label: "New pay run", to: "/app/hr/payroll?new=1", icon: Users },
  { label: "Report a problem", to: "/app/feedback?new=1", icon: Bug },
];
