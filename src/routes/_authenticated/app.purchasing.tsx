import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ModuleGate } from "@/components/billing/module-gate";

export const Route = createFileRoute("/_authenticated/app/purchasing")({
  head: () => ({ meta: [{ title: "Purchasing — Inuberry" }] }),
  component: () => <ModuleGate module="purchasing"><Outlet /></ModuleGate>,
});
