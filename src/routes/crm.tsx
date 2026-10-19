import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/marketing/module-page";

export const Route = createFileRoute("/crm")({
  head: () => ({
    meta: [
      { title: "CRM — Inuberry ERP" },
      { name: "description", content: "Manage leads, pipelines, deals, and customer relationships in one place. Built into your ERP." },
      { property: "og:title", content: "CRM — Inuberry ERP" },
      { property: "og:description", content: "Pipelines, contacts, and deals that connect directly to invoicing and fulfillment." },
    ],
  }),
  component: () => (
    <ModulePage
      code="MOD_01"
      eyebrow="Customer Relationship Management"
      title="Turn conversations into closed revenue."
      subtitle="A pipeline-first CRM that lives in the same workspace as your invoicing, inventory, and project teams."
      intro="Sales doesn't end at 'closed-won.' When a deal closes in Inuberry, the customer, products, and contract terms flow straight into invoicing and fulfillment, without re-keying data into a separate system."
      features={[
        { title: "Visual deal pipelines", body: "Drag-and-drop stages, custom statuses, and weighted forecasting per pipeline." },
        { title: "Lead capture & qualification", body: "Track lead source, score quality, and assign owners with automation rules." },
        { title: "Contacts & companies", body: "Unified records that link to invoices, projects, and support tickets." },
        { title: "Activities & follow-ups", body: "Calls, meetings, and tasks pinned to deals with automated reminders." },
        { title: "Quote-to-cash", body: "Send a quote, let the customer accept it in the portal, and turn it into an invoice." },
        { title: "Sales rep performance", body: "Per-rep dashboards: pipeline value, win rate, average cycle, and revenue closed." },
      ]}
      outcomes={[
        ["38%", "shorter sales cycles"],
        ["2.4x", "more deals tracked per rep"],
        ["0", "manual handoffs to finance"],
      ]}
    />
  ),
});
