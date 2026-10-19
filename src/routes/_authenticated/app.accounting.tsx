import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ModuleGate } from "@/components/billing/module-gate";

export const Route = createFileRoute("/_authenticated/app/accounting")({
  head: () => ({ meta: [{ title: "Accounting — Inuberry" }] }),
  component: () => <ModuleGate module="accounting"><Outlet /></ModuleGate>,
});
