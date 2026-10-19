import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ModuleGate } from "@/components/billing/module-gate";

export const Route = createFileRoute("/_authenticated/app/sales")({
  head: () => ({ meta: [{ title: "Sales — Inuberry" }] }),
  component: () => <ModuleGate module="sales"><Outlet /></ModuleGate>,
});
