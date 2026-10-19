// What Inuberry costs, in one place: /pricing, the landing page and the FAQ (which the assistant
// and the MCP help tool read) all use this. Checkout still sells the older packages
// (subscription_plans) until the plans below are set up for payment.

export type Tier = {
  key: "startup" | "startup_plus" | "core" | "growth" | "business" | "enterprise";
  name: string;
  /** USD per month; null = custom. */
  monthly: number | null;
  /** Shown before the price, e.g. "From". */
  pricePrefix?: string;
  tagline: string;
  forWho: string;
  features: string[];
  cta: { label: string; to: "/auth" | "/contact" };
  featured?: boolean;
};

/** A year costs ten months. */
export const yearly = (monthly: number) => monthly * 10;

export const TIERS: Tier[] = [
  {
    key: "startup", name: "Startup", monthly: 0, tagline: "Start running your business",
    forWho: "Free for businesses with 15 or fewer employees, or under $100,000 a year in revenue.",
    features: [
      "CRM: 250 contacts, 100 open leads and deals, simple quotes",
      "Projects: 10 active projects with tasks and deadlines",
      "HR: up to 15 employees, leave and attendance",
      "Accounting basics: 25 invoices a month, bills, profit and loss",
      "25 AI actions a month, or connect your own AI key",
      "1 automation",
      "Sponsor offers on the dashboard",
    ],
    cta: { label: "Start free", to: "/auth" },
  },
  {
    key: "startup_plus", name: "Startup Plus", monthly: 12, tagline: "The same, with no ads and more room",
    forWho: "For small businesses that want more space but don't need Core yet.",
    features: [
      "No sponsor offers",
      "1,000 contacts and 25 active projects",
      "100 AI actions a month",
      "5 automations and 3 integrations",
      "5 GB storage and longer history",
      "Standard support",
    ],
    cta: { label: "Get started", to: "/auth" },
  },
  {
    key: "core", name: "Core", monthly: 49, tagline: "Run your business",
    forWho: "For established businesses connecting their main operations.",
    features: [
      "Everything in Startup Plus",
      "Full CRM and sales pipeline, much higher limits",
      "Project templates, recurring tasks and dependencies",
      "Full HR: onboarding, offboarding, leave, HR reports",
      "Chart of accounts, journals, recurring invoices, bank imports, reconciliation",
      "250 AI actions a month across every module",
      "20 workflows and 10 GB storage",
    ],
    cta: { label: "Get started", to: "/auth" },
    featured: true,
  },
  {
    key: "growth", name: "Growth", monthly: 149, tagline: "Automate your business",
    forWho: "For growing companies that want the busywork done for them.",
    features: [
      "Everything in Core",
      "Lead routing, sales automation and forecasting",
      "Approvals, resource planning and operations dashboards",
      "Performance reviews, goals and leave policies",
      "Budgets, cash-flow forecasts, cost centres and bank feeds",
      "AI that creates and updates records, plus full MCP access",
      "Workflows with branches, schedules, webhooks and AI steps",
    ],
    cta: { label: "Get started", to: "/auth" },
  },
  {
    key: "business", name: "Business", monthly: 349, tagline: "Control complex operations",
    forWho: "For companies with several entities, stricter controls or audits.",
    features: [
      "Everything in Growth",
      "Several companies with consolidated reports",
      "Multiple currencies and intercompany accounting",
      "Department-level permissions and audit logs",
      "Advanced and scheduled AI agents",
      "A staging workspace",
      "Priority support",
    ],
    cta: { label: "Get started", to: "/auth" },
  },
  {
    key: "enterprise", name: "Enterprise", monthly: null, pricePrefix: "From $999", tagline: "Built around your requirements",
    forWho: "Priced by technical and business complexity, not headcount.",
    features: [
      "Dedicated or private cloud, or your own servers",
      "SSO (SAML) and SCIM",
      "High availability and disaster recovery",
      "An SLA, custom retention and compliance controls",
      "Custom integrations and engineering",
      "Implementation help and a dedicated contact",
    ],
    cta: { label: "Talk to us", to: "/contact" },
  },
];

/** Startup and Startup Plus side by side (the two plans with published limits). */
export const SMALL_PLAN_LIMITS: [string, string, string][] = [
  ["Sponsor offers", "Yes", "No"],
  ["Employees", "15", "15"],
  ["Contacts", "250", "1,000"],
  ["Active projects", "10", "25"],
  ["AI actions a month", "25", "100"],
  ["Automations", "1", "5"],
  ["Integrations", "1", "3"],
  ["Storage", "1 GB", "5 GB"],
  ["Support", "Self-service", "Standard"],
];

/** Self-hosting is licensed per year; you run the servers. */
export const SELF_HOST_LICENCES: [string, string][] = [
  ["Core", "$590 a year"],
  ["Growth", "$1,790 a year"],
  ["Business", "$4,190 a year"],
  ["Enterprise", "Custom"],
];

export const INSTALL_SERVICES: [string, string, string][] = [
  ["Standard install", "$750 to $1,500, once", "We install Inuberry on your servers: database, networking, SSL, storage, backups, email, AI and MCP setup, basic security and your admin account."],
  ["Advanced install", "From $2,500", "Several environments, staging, high availability, private networking, SSO, data migration and special security needs."],
];

/** "$49" or "$490"; "Free"; or the custom label. */
export function tierPrice(t: Tier, cadence: "month" | "year") {
  if (t.monthly == null) return t.pricePrefix ?? "Custom";
  if (t.monthly === 0) return "$0";
  return `$${(cadence === "year" ? yearly(t.monthly) : t.monthly).toLocaleString("en-US")}`;
}

/** Plain-text summary for the FAQ, so the assistant and AI apps can answer pricing questions. */
export function pricingSummary() {
  const plans = TIERS.map((t) =>
    `- **${t.name}**: ${t.monthly == null ? `${t.pricePrefix} a month, custom` : t.monthly === 0 ? "$0" : `$${t.monthly} a month or $${yearly(t.monthly).toLocaleString("en-US")} a year`}. ${t.forWho}`).join("\n");
  return plans;
}
