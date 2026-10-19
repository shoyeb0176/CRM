import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/marketing/module-page";

export const Route = createFileRoute("/hr")({
  head: () => ({
    meta: [
      { title: "HR — Inuberry ERP" },
      { name: "description", content: "Manage employees, departments, leave, attendance, and payroll profiles in one place." },
      { property: "og:title", content: "HR — Inuberry ERP" },
      { property: "og:description", content: "A simple HR module for small businesses: employees, leave, attendance and more." },
    ],
  }),
  component: () => (
    <ModulePage
      code="MOD_09"
      eyebrow="People operations"
      title="Take care of your team. Without the spreadsheet sprawl."
      subtitle="Employee records, departments, leave requests, attendance and payroll profiles, visible only to the people who should see them."
      intro="HR data is sensitive. Inuberry's HR module is locked down to HR managers, admins and owners by default, so compensation and personal details stay protected while the rest of the team gets what they need."
      features={[
        { title: "Employee directory", body: "Profiles with job titles, departments, managers, and employment type." },
        { title: "Departments & roles", body: "Organize teams hierarchically and assign job titles per employee." },
        { title: "Leave requests", body: "Submit, approve, and track time off with manager workflows." },
        { title: "Attendance tracking", body: "Daily attendance records with exceptions surfaced on the HR dashboard." },
        { title: "Payroll profiles", body: "Pay, bank and tax details, visible only to HR managers, admins and owners." },
        { title: "Document storage", body: "Per-employee documents for contracts, IDs, and reviews." },
      ]}
      outcomes={[
        ["100%", "role-scoped sensitive data"],
        ["1", "place for all employee records"],
        ["0", "more spreadsheet emails"],
      ]}
    />
  ),
});
