import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/marketing/module-page";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "Features — Inuberry ERP" },
      { name: "description", content: "Every module your small business needs: CRM, invoicing, inventory, projects, HR, accounting and reporting in one platform." },
      { property: "og:title", content: "Features — Inuberry ERP" },
      { property: "og:description", content: "CRM, invoicing, inventory, projects, HR, accounting and reporting in one app." },
    ],
  }),
  component: () => (
    <ModulePage
      code="FEAT_00"
      eyebrow="Platform overview"
      title="Every module your business needs. None of the bloat."
      subtitle="Inuberry replaces the separate tools a growing business collects: one app, one database, one login."
      intro="Most small businesses run on a patchwork of spreadsheets, one-off SaaS subscriptions, and email threads. Inuberry consolidates that sprawl into a single workspace where data flows naturally between sales, fulfillment, finance, and people operations."
      features={[
        { title: "Unified data model", body: "Customers, products, projects and employees are shared by every module, so nothing is typed twice or exported." },
        { title: "Role-based access", body: "Owners, admins, sales reps, accountants and HR managers each see only what their role needs." },
        { title: "Multi-organization workspaces", body: "Manage multiple legal entities or departments under a single account with isolated data and shared insights." },
        { title: "Real-time reporting", body: "Dashboards read the same data your team just entered. No nightly syncs, no waiting for month-end." },
        { title: "Customer portal", body: "Give clients a branded space to view invoices, approve quotes, and file support tickets without giving them internal access." },
        { title: "Automation rules", body: "Daily alerts for overdue invoices, low stock and late tasks, plus workflows you build without code." },
      ]}
      outcomes={[
        ["12+", "tools replaced on average"],
        ["4h", "saved per employee per week"],
        ["1", "source of truth for the whole business"],
      ]}
    />
  ),
});
