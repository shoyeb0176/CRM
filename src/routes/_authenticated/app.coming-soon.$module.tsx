import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app/app-shell";
import { Sparkles, ArrowLeft } from "lucide-react";

const LABELS: Record<string, { title: string; blurb: string }> = {
  inventory: {
    title: "Inventory",
    blurb: "Multi-warehouse stock, transfers, and reorder automation are in active development.",
  },
  purchasing: {
    title: "Purchasing",
    blurb: "Purchase orders, vendor bills, and expense capture are coming to your workspace soon.",
  },
  accounting: {
    title: "Accounting",
    blurb: "Chart of accounts, journal entries, and financial statements are landing in the next release.",
  },
  hr: {
    title: "Human Resources",
    blurb: "Employees, departments, attendance, and leave management are coming soon.",
  },
  projects: {
    title: "Projects",
    blurb: "Project tracking, tasks, milestones, and timesheets will arrive shortly.",
  },
  portal: {
    title: "Customer Portal",
    blurb: "A branded portal where your customers view quotes, invoices, and support tickets is on the way.",
  },
  assistant: {
    title: "AI Assistant",
    blurb: "Conversational AI for your ERP — ask questions, summarise data, automate workflows. Coming soon.",
  },
};

export const Route = createFileRoute("/_authenticated/app/coming-soon/$module")({
  head: () => ({ meta: [{ title: "Coming soon — Inuberry" }] }),
  component: ComingSoonPage,
});

function ComingSoonPage() {
  const { module } = Route.useParams();
  const info = LABELS[module] ?? { title: "Module", blurb: "This module is coming soon." };
  return (
    <AppShell title={info.title} breadcrumb="Coming soon">
      <div className="mx-auto flex max-w-2xl flex-col items-start gap-6 border border-dashed border-border p-12">
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-primary">
          <Sparkles className="size-3" /> On the roadmap
        </div>
        <h2 className="font-display text-3xl uppercase tracking-tight">{info.title}</h2>
        <p className="text-muted-foreground">{info.blurb}</p>
        <p className="text-sm text-muted-foreground">
          The data model is already in place — we're polishing the experience before unlocking it for everyone.
          Want early access? Email <span className="font-mono text-foreground">hello@inuberry.app</span>.
        </p>
        <Link
          to="/app"
          className="inline-flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs uppercase tracking-widest hover:bg-accent"
        >
          <ArrowLeft className="size-3" /> Back to dashboard
        </Link>
      </div>
    </AppShell>
  );
}
