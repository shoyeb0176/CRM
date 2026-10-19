import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ModuleGate } from "@/components/billing/module-gate";

export const Route = createFileRoute("/_authenticated/app/customers")({
  component: () => <ModuleGate module="crm"><Outlet /></ModuleGate>,
});
