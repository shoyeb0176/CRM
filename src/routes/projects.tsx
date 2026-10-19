import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/marketing/module-page";

export const Route = createFileRoute("/projects")({
  head: () => ({
    meta: [
      { title: "Projects — Inuberry ERP" },
      { name: "description", content: "Plan projects, track tasks, log billable time, and turn hours into invoices." },
      { property: "og:title", content: "Projects — Inuberry ERP" },
      { property: "og:description", content: "Projects, tasks, time tracking and billable hours in one place." },
    ],
  }),
  component: () => (
    <ModulePage
      code="MOD_08"
      eyebrow="Projects, tasks & time"
      title="From kickoff to invoice. Without rebuilding the spreadsheet."
      subtitle="Manage projects, assign tasks, track time, and bill clients from a single connected workflow."
      intro="In most businesses the work lives in one app, the hours in another and the invoices in a third. In Inuberry the project, its tasks, the hours logged against it and the customer it bills are the same records."
      features={[
        { title: "Project workspaces", body: "Milestones, tasks, team members, and a client-visible view per project." },
        { title: "Task management", body: "A board with statuses, priorities, due dates and assignees." },
        { title: "Time tracking", body: "Log hours against tasks or projects, with billable/non-billable flags." },
        { title: "Billable hours", body: "Mark hours billable and see the billable total for each project and week." },
        { title: "Budget vs actual", body: "See estimated hours, logged hours, and remaining budget per project." },
        { title: "Client portal access", body: "Customers see their projects and their status in the customer portal." },
      ]}
      outcomes={[
        ["100%", "of billable hours captured"],
        ["3 weeks", "faster project close-out"],
        ["1 click", "from timesheet to invoice"],
      ]}
    />
  ),
});
