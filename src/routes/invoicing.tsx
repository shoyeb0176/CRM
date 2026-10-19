import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/marketing/module-page";

export const Route = createFileRoute("/invoicing")({
  head: () => ({
    meta: [
      { title: "Invoicing — Inuberry ERP" },
      { name: "description", content: "Send professional quotes and invoices, track payments, and get paid faster." },
      { property: "og:title", content: "Invoicing — Inuberry ERP" },
      { property: "og:description", content: "Quotes, invoices, payments and a customer portal, built into your ERP." },
    ],
  }),
  component: () => (
    <ModulePage
      code="MOD_05"
      eyebrow="Quotes, invoices & billing"
      title="Get paid faster. With less paperwork."
      subtitle="Quotes and invoices with your branding, payment tracking, and a customer portal where clients find their own invoices."
      intro="Invoicing in Inuberry isn't a bolt-on. Every line item is linked to a product, and every payment posts straight to your books. Your customers see one branded portal; your finance team sees one ledger."
      features={[
        { title: "Branded quotes & invoices", body: "Custom logo, colors, terms, and per-document numbering sequences." },
        { title: "Recurring billing", body: "Schedule monthly retainers and subscriptions with automatic invoice generation." },
        { title: "Multi-currency", body: "Issue invoices in customer-local currency with FX rates captured at issue time." },
        { title: "Payment tracking", body: "Record payments, partial payments, and credits with auto-applied balances." },
        { title: "Customer portal", body: "Customers view balances, download PDFs, and accept quotes without an account." },
        { title: "Aging & dunning", body: "See outstanding invoices by age bucket and send reminders on a schedule." },
      ]}
      outcomes={[
        ["52%", "faster average collection"],
        ["100%", "of invoices auto-posted to ledger"],
        ["24/7", "self-serve customer access"],
      ]}
    />
  ),
});
