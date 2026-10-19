import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/marketing/module-page";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Inuberry ERP" },
      { name: "description", content: "Track stock levels, manage warehouses, and automate reorder points across locations." },
      { property: "og:title", content: "Inventory — Inuberry ERP" },
      { property: "og:description", content: "Real-time stock tracking across multiple warehouses, with reorder automation." },
    ],
  }),
  component: () => (
    <ModulePage
      code="MOD_06"
      eyebrow="Stock & warehouses"
      title="Know what you have. Wherever it is."
      subtitle="Real-time inventory across warehouses, with automatic adjustments from sales, purchases, and transfers."
      intro="When a sales order ships, stock decrements. When a purchase order receives, stock increments. When stock drops to its reorder level, the right people get a notification. No spreadsheets and no nightly recounts."
      features={[
        { title: "Multi-warehouse tracking", body: "Per-location stock levels with transfers and in-transit visibility." },
        { title: "Reorder automation", body: "Set thresholds; receive alerts and draft purchase orders automatically." },
        { title: "Stock movements ledger", body: "Every increment and decrement timestamped with the source transaction." },
        { title: "Product variants", body: "Sizes, colors, SKUs, and bundles modeled cleanly without workarounds." },
        { title: "Barcode-ready", body: "Scan-friendly SKU schema for receiving, picking, and physical counts." },
        { title: "Cost of goods", body: "FIFO or weighted-average costing feeds straight into your accounting." },
      ]}
      outcomes={[
        ["99.2%", "stock accuracy"],
        ["41%", "less time on stock counts"],
        ["0", "out-of-stock surprises"],
      ]}
    />
  ),
});
