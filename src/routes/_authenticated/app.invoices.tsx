import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ModuleGate } from "@/components/billing/module-gate";

export const Route = createFileRoute("/_authenticated/app/invoices")({
  head: () => ({ meta: [{ title: "Invoices — Inuberry" }] }),
  component: () => <ModuleGate module="invoices"><Outlet /></ModuleGate>,
});
