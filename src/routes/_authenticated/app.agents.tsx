import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/agents")({
  head: () => ({ meta: [{ title: "AI Agents — Inuberry" }] }),
  component: () => <Outlet />,
});
