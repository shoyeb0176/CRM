import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ModuleGate } from "@/components/billing/module-gate";

export const Route = createFileRoute("/_authenticated/app/hr")({
  head: () => ({ meta: [{ title: "HR — Inuberry" }] }),
  component: () => <ModuleGate module="hr"><Outlet /></ModuleGate>,
});
