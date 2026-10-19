import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/marketing/module-page";

export const Route = createFileRoute("/accounting")({
  head: () => ({
    meta: [
      { title: "Accounting — Inuberry ERP" },
      { name: "description", content: "Double-entry accounting, chart of accounts, ledger, and financial statements built in." },
      { property: "og:title", content: "Accounting — Inuberry ERP" },
      { property: "og:description", content: "Real double-entry accounting that posts automatically from every sale and purchase." },
    ],
  }),
  component: () => (
    <ModulePage
      code="MOD_10"
      eyebrow="Books & financials"
      title="A real ledger. Not just a CSV export."
      subtitle="Double-entry accounting that posts automatically from sales, purchases, payments, and payroll."
      intro="Inuberry isn't an invoicing tool with a 'send to QuickBooks' button. It has a real general ledger: every transaction becomes a journal entry, so your P&L, trial balance and balance sheet are always current."
      features={[
        { title: "Chart of accounts", body: "Pre-built starter chart, fully customizable for your industry." },
        { title: "Automatic journal entries", body: "Sales, purchases, payments, and payroll post to the ledger automatically." },
        { title: "General ledger", body: "Full transaction history per account, filterable by period." },
        { title: "Profit & loss", body: "Period-over-period P&L with drill-down to source transactions." },
        { title: "Trial balance", body: "Real-time trial balance to catch posting issues before they compound." },
        { title: "Multi-currency posting", body: "Foreign-currency transactions with FX captured at the entry date." },
      ]}
      outcomes={[
        ["0", "month-end reconciliation surprises"],
        ["Live", "P&L, no batch jobs"],
        ["1", "ledger across the whole business"],
      ]}
    />
  ),
});
