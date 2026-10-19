import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ModuleGate } from "@/components/billing/module-gate";

export const Route = createFileRoute("/_authenticated/app/reports")({
  head: () => ({ meta: [{ title: "Reports — Inuberry" }] }),
  component: () => <ModuleGate module="reports"><Outlet /></ModuleGate>,
});
