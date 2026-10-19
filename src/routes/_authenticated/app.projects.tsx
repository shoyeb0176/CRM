import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ModuleGate } from "@/components/billing/module-gate";

export const Route = createFileRoute("/_authenticated/app/projects")({
  head: () => ({ meta: [{ title: "Projects — Inuberry" }] }),
  component: () => <ModuleGate module="projects"><Outlet /></ModuleGate>,
});
